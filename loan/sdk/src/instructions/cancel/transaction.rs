use anyhow::{anyhow, ensure, Result};
use solana_address::Address;
use spr_client::SprIndexer;
use spr_keypair::ShieldedKeypair;
use spr_program::{ProgramOwner, ProgramProofInputs, TransactionOptions};
use spr_transaction::instructions::transact::SppProofInputs;
use loan_program::circuits::{CancelClient, CancelPrivateInputsClient, CancelPublicInputsClient};

use super::Cancel;
use crate::{
    err,
    proof::{self, CircuitId},
    shared::{field, identity, prove_transact},
    state::OfferUtxo,
};

/// Output slot of the refunded source in the cancel transaction.
pub const SOURCE_OUTPUT_SLOT: usize = 0;

pub struct CancelTransactionParams {
    pub offer_utxo: OfferUtxo,
    /// The order UTXO's leaf index in the output tree.
    pub order_leaf_index: u64,
    pub payer: Address,
    /// The output tree, which also holds the order UTXO.
    pub tree_id: u16,
}

pub struct CancelTransaction {
    lender: Address,
    offer_expiry: u64,
    pub spp_proof_inputs: SppProofInputs,
    pub proof_inputs: ProgramProofInputs,
    /// The refunded source output's blinding.
    pub source_output_blinding: [u8; 32],
}

impl CancelTransactionParams {
    /// 1. Check the lender cancels.
    /// 2. Build the program transaction.
    /// 3. Encrypt the refund to the lender.
    pub fn build(self, lender: &ShieldedKeypair) -> Result<CancelTransaction> {
        // 1. Check the lender cancels.
        let sender = lender.shielded_address().map_err(err)?;
        let terms = &self.offer_utxo.terms;
        ensure!(terms.lender == sender, "only the order lender can cancel it");
        let maker_address = sender.solana_address().map_err(err)?;

        // 2. Build the program transaction.
        let transaction = CancelClient {
            private: CancelPrivateInputsClient {
                tx_context: TransactionOptions {
                    blinding_seed: None,
                    output_tree_id: Some(self.tree_id),
                },
                terms: terms.circuit_terms()?,
                offer_utxo: self
                    .offer_utxo
                    .to_input_utxo(self.tree_id, self.order_leaf_index)?,
            },
            public: CancelPublicInputsClient {
                expiry: terms.expiry,
                lender_owner_pk_field: field(identity(&maker_address)?)?,
            },
        }
        .prepare(&sender, self.payer)
        .map_err(err)?;
        let finalized = transaction.finalized;
        let source_output_blinding = finalized
            .output_utxos()
            .get(SOURCE_OUTPUT_SLOT)
            .ok_or_else(|| anyhow!("the cancel transaction has no source output"))?
            .blinding;

        // 3. Encrypt the refund to the lender.
        let key = lender
            .get_transaction_viewing_key(&finalized.first_nullifier().map_err(err)?)
            .map_err(err)?;
        let spp_proof_inputs = finalized.encrypt_with_viewing_key(&key).map_err(err)?;
        Ok(CancelTransaction {
            lender: maker_address,
            offer_expiry: terms.expiry,
            spp_proof_inputs,
            proof_inputs: transaction.proof_inputs,
            source_output_blinding,
        })
    }
}

impl CancelTransaction {
    /// 1. Prove the SPP transaction, whose input the order-authority PDA owns.
    /// 2. Prove the cancel circuit and build the instruction.
    pub fn prove(self, indexer: &SprIndexer, tree: Address) -> Result<Cancel> {
        let payer = self.spp_proof_inputs.payer;
        // 1. Prove the SPP transaction.
        let spp_proof = prove_transact(
            indexer,
            self.spp_proof_inputs,
            &ProgramOwner::nullifier_key(),
        )?;
        // 2. Prove the cancel circuit and build the instruction.
        let cancel_proof = proof::prove(CircuitId::Cancel, &self.proof_inputs)?;
        Ok(Cancel {
            lender: self.lender,
            payer,
            tree,
            cancel_proof,
            offer_expiry: self.offer_expiry,
            spp_proof,
        })
    }
}
