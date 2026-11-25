use anyhow::Result;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spr_interface::{
    instruction::instruction_data::transact::TransactIxData, SHIELDED_POOL_PROGRAM_ID,
};
use spr_program::instruction::nullifier_pda_accounts;
use loan_program::instructions::cancel::CancelIxData;

use crate::{err, loan_authority_bump, loan_authority_pda, tag, CancelProof};

pub struct Cancel {
    /// The lender's ed25519 pubkey, a dedicated readonly signer the swap program
    /// checks against the cancel proof's committed lender.
    pub lender: Pubkey,
    pub payer: Pubkey,
    pub tree: Pubkey,
    pub cancel_proof: CancelProof,
    pub offer_expiry: u64,
    pub spp_proof: TransactIxData,
}

impl Cancel {
    pub fn instruction(self) -> Result<Instruction> {
        let Self {
            lender,
            payer,
            tree,
            cancel_proof,
            offer_expiry,
            spp_proof,
        } = self;

        let nullifier_pdas = nullifier_pda_accounts(
            &tree,
            spp_proof.inputs.iter().map(|input| &input.nullifier_hash),
        );
        let serialized_ix = wincode::serialize(&CancelIxData {
            proof: cancel_proof,
            offer_expiry,
            authority_bump: loan_authority_bump(&lender),
            transact: spp_proof,
        })
        .map_err(err)?;

        // The lender is a dedicated readonly signer after the fee payer; the swap
        // program checks its pubkey against the cancel proof's committed lender.
        let mut accounts = vec![
            AccountMeta::new(payer, true),
            AccountMeta::new_readonly(lender, true),
            AccountMeta::new(payer, true),
            AccountMeta::new(tree, false),
            AccountMeta::new_readonly(Pubkey::new_from_array(SHIELDED_POOL_PROGRAM_ID), false),
            AccountMeta::new_readonly(Pubkey::default(), false),
            AccountMeta::new(tree, false),
        ];
        accounts.extend(nullifier_pdas);
        accounts.push(AccountMeta::new_readonly(
            loan_authority_pda(&lender),
            false,
        ));
        let mut instruction_data = vec![tag::CANCEL];
        instruction_data.extend_from_slice(&serialized_ix);
        Ok(Instruction {
            program_id: loan_program::ID,
            accounts,
            data: instruction_data,
        })
    }
}
