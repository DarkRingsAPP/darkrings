use anyhow::Result;
use loan_program::instructions::claim::ClaimIxData;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spr_interface::{
    instruction::instruction_data::transact::TransactIxData, SHIELDED_POOL_PROGRAM_ID,
};
use spr_program::instruction::nullifier_pda_accounts;

use crate::{err, loan_authority_bump, loan_authority_pda, tag, ClaimProof};

pub struct Claim {
    /// The lender's ed25519 pubkey, a dedicated readonly signer the loan
    /// program checks against the claim proof's committed lender.
    pub lender: Pubkey,
    pub payer: Pubkey,
    pub tree: Pubkey,
    pub claim_proof: ClaimProof,
    pub deadline: u64,
    pub spp_proof: TransactIxData,
}

impl Claim {
    pub fn instruction(self) -> Result<Instruction> {
        let Self {
            lender,
            payer,
            tree,
            claim_proof,
            deadline,
            spp_proof,
        } = self;

        let nullifier_pdas = nullifier_pda_accounts(
            &tree,
            spp_proof.inputs.iter().map(|input| &input.nullifier_hash),
        );
        let serialized_ix = wincode::serialize(&ClaimIxData {
            proof: claim_proof,
            deadline,
            authority_bump: loan_authority_bump(&lender),
            transact: spp_proof,
        })
        .map_err(err)?;

        // The lender is a dedicated readonly signer after the fee payer; the
        // loan program checks its pubkey against the claim proof's committed
        // lender.
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
        let mut instruction_data = vec![tag::CLAIM];
        instruction_data.extend_from_slice(&serialized_ix);
        Ok(Instruction {
            program_id: loan_program::ID,
            accounts,
            data: instruction_data,
        })
    }
}
