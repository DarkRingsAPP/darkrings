use anyhow::{anyhow, ensure, Result};
use loan_program::circuits::{
    OriginateClient, OriginatePrivateInputsClient, OriginatePublicInputsClient,
};
use solana_address::Address;
use spr_client::SprIndexer;
use spr_keypair::ShieldedKeypair;
use spr_program::{InputRecords, ProgramProofInputs, TransactionOptions};
use spr_transaction::{instructions::transact::SppProofInputs, WalletUtxo};

use super::{originate_blinding_seed, Originate};
use crate::{
    err,
    proof::{self, CircuitId},
    shared::{field, identity, prove_transact, SettleAuthority},
    state::{LoanTerms, LoanUtxo, OfferUtxo},
};

/// Output slot of the principal paid to the borrower in the originate
/// transaction.
pub const PRINCIPAL_OUTPUT_SLOT: usize = 0;
/// Output slot of the loan UTXO in the originate transaction.
pub const LOAN_OUTPUT_SLOT: usize = 1;

pub struct OriginateTransactionParams {
    pub offer_utxo: OfferUtxo,
    /// The offer UTXO's leaf index in the output tree.
    pub offer_leaf_index: u64,
    /// The borrower's UTXO of exactly `collateral_amount` of the collateral
    /// mint, in the output tree.
    pub collateral_input: WalletUtxo,
    pub payer: Address,
    /// The output tree, which also holds both inputs.
    pub tree_id: u16,
}

pub struct OriginateTransaction {
    /// The offer's lender, whose loan-authority PDA the program signs for
    /// and whose viewing key the loan UTXO is encrypted to.
    pub lender: Address,
    pub viewing_pubkey: [u8; 33],
    pub spp_proof_inputs: SppProofInputs,
    pub proof_inputs: ProgramProofInputs,
    /// The offer UTXO's nullifier, the transaction's first nullifier.
    pub first_nullifier: [u8; 32],
    /// The borrower's principal output's blinding.
    pub principal_output_blinding: [u8; 32],
    /// The loan UTXO the transaction creates: its opening is what the
    /// borrower keeps to repay, and what the lender decrypts to claim.
    pub loan_utxo: LoanUtxo,
}

impl OriginateTransactionParams {
    /// 1. Check the collateral input matches the offer and the borrower may
    ///    originate.
    /// 2. Build the program transaction under the offer's originate blinding
    ///    seed, with the offer expiry as the transact expiry.
    /// 3. Read the loan UTXO it creates and check both parties can derive
    ///    the outputs from the offer opening.
    /// 4. Encrypt the outputs to the lender's viewing key.
    pub fn build(self, borrower: &ShieldedKeypair) -> Result<OriginateTransaction> {
        // 1. Check the collateral input and the designated borrower.
        let sender = borrower.shielded_address().map_err(err)?;
        let terms = &self.offer_utxo.terms;
        ensure!(
            self.collateral_input.utxo.asset == terms.collateral_mint
                && self.collateral_input.utxo.amount == terms.collateral_amount,
            "the collateral input must hold exactly the collateral amount of the collateral mint"
        );
        ensure!(
            self.collateral_input.tree_id == self.tree_id,
            "the collateral input is in tree {}, not in the output tree {}",
            self.collateral_input.tree_id,
            self.tree_id
        );
        if let Some(designated) = terms.borrower {
            ensure!(
                identity(&sender.solana_address().map_err(err)?)? == designated,
                "the offer designates another borrower"
            );
        }
        let offer_input = self
            .offer_utxo
            .to_input_utxo(self.tree_id, self.offer_leaf_index)?;
        let first_nullifier = offer_input.nullifier;
        let borrower_owner = *InputRecords::new().address(&sender).map_err(err)?.owner();

        // 2. Build the program transaction. The loan UTXO's owner is the
        // lender's loan authority with the lender's viewing key, which the
        // program derives from the instruction's lender argument.
        let loan_terms = LoanTerms {
            principal_mint: self.offer_utxo.principal_mint,
            repay_amount: terms.repay_amount,
            lender: terms.lender,
            borrower: borrower_owner,
            deadline: terms.deadline,
        };
        let transaction = OriginateClient {
            private: OriginatePrivateInputsClient {
                tx_context: TransactionOptions {
                    blinding_seed: Some(originate_blinding_seed(&self.offer_utxo.blinding)?),
                    output_tree_id: Some(self.tree_id),
                },
                terms: terms.circuit_terms()?,
                offer_utxo: offer_input,
                collateral_in: self.collateral_input,
            },
            public: OriginatePublicInputsClient {
                expiry: terms.expiry,
                first_nullifier: field(first_nullifier)?,
                loan_owner: loan_terms
                    .loan_authority()?
                    .address(terms.lender.viewing_pubkey)
                    .map_err(err)?,
            },
        }
        .prepare(&sender, self.payer)
        .map_err(err)?;
        let finalized = transaction.finalized.with_expiry_unix_ts(terms.expiry);
        ensure!(
            finalized.first_nullifier().map_err(err)? == first_nullifier,
            "the offer UTXO must be the first input"
        );

        // 3. Read the loan UTXO and check the derived outputs.
        let outputs = finalized.output_utxos();
        let principal = outputs
            .get(PRINCIPAL_OUTPUT_SLOT)
            .ok_or_else(|| anyhow!("the originate transaction has no principal output"))?;
        ensure!(
            principal.hash(self.tree_id).map_err(err)?
                == self
                    .offer_utxo
                    .derived_principal_output(&first_nullifier, sender)?
                    .hash(self.tree_id)
                    .map_err(err)?,
            "the principal payout does not derive from the offer opening"
        );
        let principal_output_blinding = principal.blinding;
        let loan_output = outputs
            .get(LOAN_OUTPUT_SLOT)
            .ok_or_else(|| anyhow!("the originate transaction has no loan output"))?;
        let loan_utxo = LoanUtxo {
            terms: loan_terms,
            blinding: loan_output.blinding,
            collateral_mint: terms.collateral_mint,
            collateral_amount: terms.collateral_amount,
        };
        ensure!(
            loan_utxo.hash(self.tree_id)? == loan_output.hash(self.tree_id).map_err(err)?,
            "the loan output does not commit the loan terms"
        );

        // 4. Encrypt the outputs.
        let key = borrower
            .get_transaction_viewing_key(&first_nullifier)
            .map_err(err)?;
        let spp_proof_inputs = finalized.encrypt_with_viewing_key(&key).map_err(err)?;
        Ok(OriginateTransaction {
            lender: terms.lender.solana_address().map_err(err)?,
            viewing_pubkey: *terms.lender.viewing_pubkey.as_bytes(),
            spp_proof_inputs,
            proof_inputs: transaction.proof_inputs,
            first_nullifier,
            principal_output_blinding,
            loan_utxo,
        })
    }
}

impl OriginateTransaction {
    /// 1. Prove the SPP transaction with the loan-authority and borrower
    ///    keys.
    /// 2. Prove the originate circuit and build the instruction.
    pub fn prove(
        self,
        indexer: &SprIndexer,
        tree: Address,
        borrower: &ShieldedKeypair,
    ) -> Result<Originate> {
        let payer = self.spp_proof_inputs.payer;
        // 1. Prove the SPP transaction.
        let spp_proof = prove_transact(
            indexer,
            self.spp_proof_inputs,
            &SettleAuthority(borrower),
        )?;
        // 2. Prove the originate circuit and build the instruction.
        let originate_proof = proof::prove(CircuitId::Originate, &self.proof_inputs)?;
        Ok(Originate {
            payer,
            lender: self.lender,
            viewing_pubkey: self.viewing_pubkey,
            tree,
            originate_proof,
            spp_proof,
        })
    }
}
