use anyhow::{anyhow, ensure, Result};
use loan_program::circuits::{RepayClient, RepayPrivateInputsClient, RepayPublicInputsClient};
use solana_address::Address;
use spr_client::SprIndexer;
use spr_keypair::ShieldedKeypair;
use spr_program::{InputRecords, ProgramProofInputs, TransactionOptions};
use spr_transaction::{instructions::transact::SppProofInputs, WalletUtxo};

use super::{repay_blinding_seed, Repay};
use crate::{
    err,
    proof::{self, CircuitId},
    shared::{field, prove_transact, SettleAuthority},
    state::LoanUtxo,
};

/// Output slot of the collateral returned to the borrower in the repay
/// transaction.
pub const COLLATERAL_OUTPUT_SLOT: usize = 0;
/// Output slot of the repayment paid to the lender in the repay transaction.
pub const REPAYMENT_OUTPUT_SLOT: usize = 1;

pub struct RepayTransactionParams {
    pub loan_utxo: LoanUtxo,
    /// The loan UTXO's leaf index in the output tree.
    pub loan_leaf_index: u64,
    /// The borrower's UTXO of exactly `repay_amount` of the principal mint,
    /// in the output tree.
    pub repay_input: WalletUtxo,
    pub payer: Address,
    /// The output tree, which also holds both inputs.
    pub tree_id: u16,
}

pub struct RepayTransaction {
    /// The loan's lender, whose loan-authority PDA the program signs for.
    pub lender: Address,
    /// The committed loan deadline the program checks against the Clock.
    pub deadline: u64,
    pub spp_proof_inputs: SppProofInputs,
    pub proof_inputs: ProgramProofInputs,
    /// The loan UTXO's nullifier, the transaction's first nullifier.
    pub first_nullifier: [u8; 32],
    /// The borrower's returned collateral output's blinding.
    pub collateral_output_blinding: [u8; 32],
    /// The lender's repayment blinding, which the lender derives with
    /// [`LoanUtxo::derived_repayment_output`].
    pub repayment_output_blinding: [u8; 32],
}

impl RepayTransactionParams {
    /// 1. Check the repay input pays the repayment and the borrower repays.
    /// 2. Build the program transaction under the loan's repay blinding
    ///    seed.
    /// 3. Check the lender can derive its repayment from the loan opening.
    /// 4. Encrypt the outputs.
    pub fn build(self, borrower: &ShieldedKeypair) -> Result<RepayTransaction> {
        // 1. Check the repay input and the borrower.
        let sender = borrower.shielded_address().map_err(err)?;
        let terms = &self.loan_utxo.terms;
        ensure!(
            self.repay_input.utxo.asset == terms.principal_mint
                && self.repay_input.utxo.amount == terms.repay_amount,
            "the repay input must hold exactly the repay amount of the principal mint"
        );
        ensure!(
            self.repay_input.tree_id == self.tree_id,
            "the repay input is in tree {}, not in the output tree {}",
            self.repay_input.tree_id,
            self.tree_id
        );
        ensure!(
            *InputRecords::new().address(&sender).map_err(err)?.owner() == terms.borrower,
            "the loan names another borrower"
        );
        let loan_input = self
            .loan_utxo
            .to_input_utxo(self.tree_id, self.loan_leaf_index)?;
        let first_nullifier = loan_input.nullifier;

        // 2. Build the program transaction.
        let transaction = RepayClient {
            private: RepayPrivateInputsClient {
                tx_context: TransactionOptions {
                    blinding_seed: Some(repay_blinding_seed(&self.loan_utxo.blinding)?),
                    output_tree_id: Some(self.tree_id),
                },
                terms: terms.circuit_terms()?,
                loan_utxo: loan_input,
                repay_in: self.repay_input,
                lender_address: terms.lender,
            },
            public: RepayPublicInputsClient {
                deadline: terms.deadline,
                first_nullifier: field(first_nullifier)?,
            },
        }
        .prepare(&sender, self.payer)
        .map_err(err)?;
        let finalized = transaction.finalized;
        ensure!(
            finalized.first_nullifier().map_err(err)? == first_nullifier,
            "the loan UTXO must be the first input"
        );

        // 3. Check the derived outputs.
        let outputs = finalized.output_utxos();
        let collateral_output_blinding = outputs
            .get(COLLATERAL_OUTPUT_SLOT)
            .ok_or_else(|| anyhow!("the repay transaction has no collateral output"))?
            .blinding;
        let repayment = outputs
            .get(REPAYMENT_OUTPUT_SLOT)
            .ok_or_else(|| anyhow!("the repay transaction has no repayment output"))?;
        ensure!(
            repayment.hash(self.tree_id).map_err(err)?
                == self
                    .loan_utxo
                    .derived_repayment_output(&first_nullifier)?
                    .hash(self.tree_id)
                    .map_err(err)?,
            "the lender repayment does not derive from the loan opening"
        );
        let repayment_output_blinding = repayment.blinding;

        // 4. Encrypt the outputs.
        let key = borrower
            .get_transaction_viewing_key(&first_nullifier)
            .map_err(err)?;
        let spp_proof_inputs = finalized.encrypt_with_viewing_key(&key).map_err(err)?;
        Ok(RepayTransaction {
            lender: terms.lender.solana_address().map_err(err)?,
            deadline: terms.deadline,
            spp_proof_inputs,
            proof_inputs: transaction.proof_inputs,
            first_nullifier,
            collateral_output_blinding,
            repayment_output_blinding,
        })
    }
}

impl RepayTransaction {
    /// 1. Prove the SPP transaction with the loan-authority and borrower
    ///    keys.
    /// 2. Prove the repay circuit and build the instruction.
    pub fn prove(
        self,
        indexer: &SprIndexer,
        tree: Address,
        borrower: &ShieldedKeypair,
    ) -> Result<Repay> {
        let payer = self.spp_proof_inputs.payer;
        // 1. Prove the SPP transaction.
        let spp_proof = prove_transact(
            indexer,
            self.spp_proof_inputs,
            &SettleAuthority(borrower),
        )?;
        // 2. Prove the repay circuit and build the instruction.
        let repay_proof = proof::prove(CircuitId::Repay, &self.proof_inputs)?;
        Ok(Repay {
            payer,
            lender: self.lender,
            deadline: self.deadline,
            tree,
            repay_proof,
            spp_proof,
        })
    }
}
