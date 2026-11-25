use anyhow::Result;
use loan_program::instructions::repay::RepayIxData;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spr_interface::{
    instruction::instruction_data::transact::TransactIxData, SHIELDED_POOL_PROGRAM_ID,
};
use spr_program::instruction::nullifier_pda_accounts;

use crate::{err, loan_authority_bump, loan_authority_pda, tag, RepayProof};

#[derive(Clone)]
pub struct Repay {
    pub payer: Pubkey,
    /// The loan's lender, whose loan-authority PDA owns the loan UTXO and
    /// signs its spend.
    pub lender: Pubkey,
    /// The committed loan deadline; the program checks `now <= deadline`.
    pub deadline: u64,
    pub tree: Pubkey,
    pub repay_proof: RepayProof,
    pub spp_proof: TransactIxData,
}

impl Repay {
    pub fn instruction(self) -> Result<Instruction> {
        let Self {
            payer,
            lender,
            deadline,
            tree,
            repay_proof,
            spp_proof,
        } = self;

        let nullifier_pdas = nullifier_pda_accounts(
            &tree,
            spp_proof.inputs.iter().map(|input| &input.nullifier_hash),
        );
        let serialized_ix = wincode::serialize(&RepayIxData {
            proof: repay_proof,
            lender: lender.to_bytes(),
            deadline,
            authority_bump: loan_authority_bump(&lender),
            transact: spp_proof,
        })
        .map_err(err)?;

        let mut accounts = vec![
            AccountMeta::new(payer, true),
            AccountMeta::new(payer, true),
            AccountMeta::new(tree, false),
            AccountMeta::new_readonly(Pubkey::new_from_array(SHIELDED_POOL_PROGRAM_ID), false),
            AccountMeta::new_readonly(Pubkey::default(), false),
            AccountMeta::new(tree, false),
        ];
        accounts.extend(nullifier_pdas);
        // The loan is the first input; the borrower's repayment is the
        // second. The borrower also pays, but must appear explicitly in the
        // owner slots.
        accounts.push(AccountMeta::new_readonly(
            loan_authority_pda(&lender),
            false,
        ));
        accounts.push(AccountMeta::new_readonly(payer, true));
        let mut instruction_data = vec![tag::REPAY];
        instruction_data.extend_from_slice(&serialized_ix);
        Ok(Instruction {
            program_id: loan_program::ID,
            accounts,
            data: instruction_data,
        })
    }
}
