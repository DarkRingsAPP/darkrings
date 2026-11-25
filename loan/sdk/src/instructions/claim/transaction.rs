use anyhow::{anyhow, ensure, Result};
use loan_program::circuits::{ClaimClient, ClaimPrivateInputsClient, ClaimPublicInputsClient};
use solana_address::Address;
use spr_client::SprIndexer;
use spr_keypair::ShieldedKeypair;
use spr_program::{ProgramOwner, ProgramProofInputs, TransactionOptions};
use spr_transaction::instructions::transact::SppProofInputs;

use super::Claim;
use crate::{
    err,
    proof::{self, CircuitId},
    shared::{field, identity, prove_transact},
    state::LoanUtxo,
};

/// Output slot of the claimed collateral in the claim transaction.
pub const COLLATERAL_OUTPUT_SLOT: usize = 0;

pub struct ClaimTransactionParams {
    pub loan_utxo: LoanUtxo,
    /// The loan UTXO's leaf index in the output tree.
    pub loan_leaf_index: u64,
    pub payer: Address,
    /// The output tree, which also holds the loan UTXO.
    pub tree_id: u16,
}

pub struct ClaimTransaction {
    lender: Address,
    deadline: u64,
    pub spp_proof_inputs: SppProofInputs,
    pub proof_inputs: ProgramProofInputs,
    /// The claimed collateral output's blinding.
    pub collateral_output_blinding: [u8; 32],
}

impl ClaimTransactionParams {
    /// 1. Check the lender claims.
    /// 2. Build the program transaction.
    /// 3. Encrypt the collateral to the lender.
    pub fn build(self, lender: &ShieldedKeypair) -> Result<ClaimTransaction> {
        // 1. Check the lender claims.
        let sender = lender.shielded_address().map_err(err)?;
        let terms = &self.loan_utxo.terms;
        ensure!(terms.lender == sender, "only the loan's lender can claim");
        let lender_address = sender.solana_address().map_err(err)?;

        // 2. Build the program transaction.
        let transaction = ClaimClient {
            private: ClaimPrivateInputsClient {
                tx_context: TransactionOptions {
                    blinding_seed: None,
                    output_tree_id: Some(self.tree_id),
                },
                loan_utxo: self
                    .loan_utxo
                    .to_input_utxo(self.tree_id, self.loan_leaf_index)?,
                terms: terms.circuit_terms()?,
            },
            public: ClaimPublicInputsClient {
                deadline: terms.deadline,
                lender_owner_pk_field: field(identity(&lender_address)?)?,
            },
        }
        .prepare(&sender, self.payer)
        .map_err(err)?;
        let finalized = transaction.finalized;
        let collateral_output_blinding = finalized
            .output_utxos()
            .get(COLLATERAL_OUTPUT_SLOT)
            .ok_or_else(|| anyhow!("the claim transaction has no collateral output"))?
            .blinding;

        // 3. Encrypt the collateral to the lender.
        let key = lender
            .get_transaction_viewing_key(&finalized.first_nullifier().map_err(err)?)
            .map_err(err)?;
        let spp_proof_inputs = finalized.encrypt_with_viewing_key(&key).map_err(err)?;
        Ok(ClaimTransaction {
            lender: lender_address,
            deadline: terms.deadline,
            spp_proof_inputs,
            proof_inputs: transaction.proof_inputs,
            collateral_output_blinding,
        })
    }
}

impl ClaimTransaction {
    /// 1. Prove the SPP transaction, whose input the loan-authority PDA
    ///    owns.
    /// 2. Prove the claim circuit and build the instruction.
    pub fn prove(self, indexer: &SprIndexer, tree: Address) -> Result<Claim> {
        let payer = self.spp_proof_inputs.payer;
        // 1. Prove the SPP transaction.
        let spp_proof = prove_transact(
            indexer,
            self.spp_proof_inputs,
            &ProgramOwner::nullifier_key(),
        )?;
        // 2. Prove the claim circuit and build the instruction.
        let claim_proof = proof::prove(CircuitId::Claim, &self.proof_inputs)?;
        Ok(Claim {
            lender: self.lender,
            payer,
            tree,
            claim_proof,
            deadline: self.deadline,
            spp_proof,
        })
    }
}
