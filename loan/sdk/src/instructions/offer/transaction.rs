use anyhow::{anyhow, ensure, Result};
use solana_address::Address;
use spr_client::SprIndexer;
use spr_keypair::{ShieldedAddress, ShieldedKeypair};
use spr_program::{ProgramProofInputs, TransactionOptions};
use spr_transaction::{instructions::transact::SppProofInputs, WalletUtxo};
use loan_program::circuits::{OfferClient, OfferPrivateInputsClient, OfferPublicInputsClient};

use super::{Offer, OfferMarker};
use crate::{
    err, loan_authority,
    proof::{self, CircuitId},
    shared::{field, identity, prove_transact},
    state::{OfferTerms, OfferUtxo},
};

/// Output slot of the change in the make transaction.
pub const CHANGE_SLOT: usize = 0;
/// Output slot of the order UTXO in the make transaction; the program reads
/// the order UTXO hash for the marker from it.
pub const OFFER_SLOT: usize = 1;

pub struct OfferTransactionParams {
    pub terms: OfferTerms,
    /// The amount locked in the order UTXO; the rest of `source` is change.
    pub principal_amount: u64,
    /// The spent source UTXO, owned by the lender, who signs for it. The rest
    /// of it returns to the lender as change. Its tree is the output tree.
    pub source: WalletUtxo,
    /// The borrower the order output is encrypted to and the marker is tagged
    /// for. It may differ from `terms.borrower`, the identity allowed to take.
    pub borrower_address: ShieldedAddress,
    /// The lender's Solana address, the fee payer and the signer the client
    /// writes into the marker. The program checks the marker names this
    /// signer, and the make proof checks it against the source owner.
    pub payer: Address,
}

pub struct OfferTransaction {
    /// The borrower's viewing key, the order UTXO address's viewing key, which
    /// the program hashes into the make proof's public `offer_owner`.
    pub viewing_pubkey: [u8; 33],
    pub spp_proof_inputs: SppProofInputs,
    pub proof_inputs: ProgramProofInputs,
    /// The order UTXO the transaction creates, with its derived blinding.
    pub offer_utxo: OfferUtxo,
    /// The change output's blinding.
    pub change_blinding: [u8; 32],
}

impl OfferTransactionParams {
    /// 1. Check the terms name the lender and the lender owns the source.
    /// 2. Build the program transaction.
    /// 3. Read the order UTXO and the change it created.
    /// 4. Encrypt the outputs and add the borrower's marker message.
    pub fn build(self, lender: &ShieldedKeypair) -> Result<OfferTransaction> {
        // 1. Check the terms name the lender and the lender owns the source.
        let sender = lender.shielded_address().map_err(err)?;
        ensure!(
            self.terms.lender == sender,
            "the order terms name another lender"
        );
        ensure!(
            self.payer == sender.solana_address().map_err(err)?,
            "the payer is not the lender's Solana address"
        );
        ensure!(
            self.source.utxo.owner == lender.signing_pubkey(),
            "the source is not owned by the lender"
        );
        let principal_mint = self.source.utxo.asset;
        let tree_id = self.source.tree_id;

        // 2. Build the program transaction. The circuit takes the lender from
        // the source owner; the order UTXO's owner is the lender's order
        // authority with the borrower's viewing key, which the program derives
        // from the lender signer.
        let terms = self.terms.circuit_terms()?;
        let transaction = OfferClient {
            private: OfferPrivateInputsClient {
                tx_context: TransactionOptions {
                    blinding_seed: None,
                    output_tree_id: Some(tree_id),
                },
                source: self.source,
                principal_amount: self.principal_amount,
                collateral_mint: terms.collateral_mint,
                collateral_amount: terms.collateral_amount,
                repay_amount: terms.repay_amount,
                deadline: terms.deadline,
                expiry: terms.expiry,
                borrower_pk_fe: terms.borrower_pk_fe,
            },
            public: OfferPublicInputsClient {
                lender_owner_pk_field: field(identity(&self.payer)?)?,
                offer_owner: loan_authority(&self.payer)
                    .address(self.borrower_address.viewing_pubkey)
                    .map_err(err)?,
            },
        }
        .prepare(&sender, self.payer)
        .map_err(err)?;
        let finalized = transaction.finalized;

        // 3. Read the order UTXO and the change it created.
        let outputs = finalized.output_utxos();
        let change = outputs
            .get(CHANGE_SLOT)
            .ok_or_else(|| anyhow!("the make transaction has no change output"))?;
        let order_output = outputs
            .get(OFFER_SLOT)
            .ok_or_else(|| anyhow!("the make transaction has no order output"))?;
        let offer_utxo = OfferUtxo {
            terms: self.terms,
            blinding: order_output.blinding,
            principal_mint,
            principal_amount: self.principal_amount,
        };
        let offer_utxo_hash = order_output.hash(tree_id).map_err(err)?;
        ensure!(
            offer_utxo.hash(tree_id)? == offer_utxo_hash,
            "the order output does not commit the order terms"
        );
        let change_blinding = change.blinding;

        // 4. Encrypt the outputs and add the marker, the transaction's only
        // message. The program checks its data is the `MarkerData` of the
        // order output and the payer, and forwards it unchanged.
        let key = lender
            .get_transaction_viewing_key(&finalized.first_nullifier().map_err(err)?)
            .map_err(err)?;
        let mut spp_proof_inputs = finalized.encrypt_with_viewing_key(&key).map_err(err)?;
        spp_proof_inputs.external_data.messages.push(
            OfferMarker {
                offer_utxo_hash,
                lender_pubkey: self.payer,
                borrower_address: self.borrower_address,
            }
            .message()
            .map_err(err)?,
        );
        Ok(OfferTransaction {
            viewing_pubkey: *self.borrower_address.viewing_pubkey.as_bytes(),
            spp_proof_inputs,
            proof_inputs: transaction.proof_inputs,
            offer_utxo,
            change_blinding,
        })
    }
}

impl OfferTransaction {
    /// 1. Prove the SPP transaction, whose real input the lender owns.
    /// 2. Prove the make circuit and build the instruction.
    pub fn prove(
        self,
        indexer: &SprIndexer,
        tree: Address,
        lender: &ShieldedKeypair,
    ) -> Result<Offer> {
        let payer = self.spp_proof_inputs.payer;
        // 1. Prove the SPP transaction.
        let spp_proof = prove_transact(indexer, self.spp_proof_inputs, lender)?;
        // 2. Prove the make circuit and build the instruction.
        let offer_proof = proof::prove(CircuitId::Offer, &self.proof_inputs)?;
        Ok(Offer {
            viewing_pubkey: self.viewing_pubkey,
            payer,
            tree,
            offer_proof,
            spp_proof,
        })
    }
}
