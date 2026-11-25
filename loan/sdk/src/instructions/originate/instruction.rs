use anyhow::Result;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spr_interface::{
    instruction::instruction_data::transact::TransactIxData, SHIELDED_POOL_PROGRAM_ID,
};
use spr_program::instruction::nullifier_pda_accounts;
use loan_program::instructions::originate::OriginateIxData;

use crate::{err, loan_authority_bump, loan_authority_pda, tag, OriginateProof};

#[derive(Clone)]
pub struct Originate {
    pub payer: Pubkey,
    /// The offer's lender, whose loan-authority PDA owns the offer UTXO,
    /// signs its spend, and owns the loan UTXO the originate creates.
    pub lender: Pubkey,
    /// The viewing key of the loan UTXO's address, the lender's.
    pub viewing_pubkey: [u8; 33],
    pub tree: Pubkey,
    pub originate_proof: OriginateProof,
    pub spp_proof: TransactIxData,
}

impl Originate {
    pub fn instruction(self) -> Result<Instruction> {
        let Self {
            payer,
            lender,
            viewing_pubkey,
            tree,
            originate_proof,
            spp_proof,
        } = self;

        let nullifier_pdas = nullifier_pda_accounts(
            &tree,
            spp_proof.inputs.iter().map(|input| &input.nullifier_hash),
        );
        let serialized_ix = wincode::serialize(&OriginateIxData {
            proof: originate_proof,
            lender: lender.to_bytes(),
            viewing_pubkey,
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
        // The offer is the first input; the borrower's collateral is the second.
        // The borrower also pays, but must appear explicitly in the owner slots.
        accounts.push(AccountMeta::new_readonly(
            loan_authority_pda(&lender),
            false,
        ));
        accounts.push(AccountMeta::new_readonly(payer, true));
        let mut instruction_data = vec![tag::ORIGINATE];
        instruction_data.extend_from_slice(&serialized_ix);
        Ok(Instruction {
            program_id: loan_program::ID,
            accounts,
            data: instruction_data,
        })
    }
}
