use anyhow::Result;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spr_interface::{
    instruction::instruction_data::transact::{MessageData, TransactIxData},
    SHIELDED_POOL_PROGRAM_ID,
};
use spr_keypair::ShieldedAddress;
use spr_program::instruction::nullifier_pda_accounts;
use spr_transaction::TransactionError;

use crate::{
    err, loan_authority_bump, loan_authority_pda, tag, OfferIxData, OfferProof, MarkerData,
};

pub struct OfferMarker {
    pub offer_utxo_hash: [u8; 32],
    pub lender_pubkey: Pubkey,
    pub borrower_address: ShieldedAddress,
}

impl OfferMarker {
    pub fn message(self) -> Result<MessageData, TransactionError> {
        Ok(MessageData {
            view_tag: self.borrower_address.signing_pubkey.confidential_view_tag()?,
            data: borsh::to_vec(&MarkerData {
                offer_utxo_hash: self.offer_utxo_hash,
                lender_pubkey: self.lender_pubkey.to_bytes(),
            })
            .map_err(|e| TransactionError::Serialize(e.to_string()))?,
        })
    }
}

pub struct Offer {
    /// The lender: fee payer, marker signer and owner of the spent source.
    pub payer: Pubkey,
    /// The viewing key of the order UTXO's address, the borrower's.
    pub viewing_pubkey: [u8; 33],
    pub tree: Pubkey,
    pub offer_proof: OfferProof,
    pub spp_proof: TransactIxData,
}

impl Offer {
    pub fn instruction(self) -> Result<Instruction> {
        let Self {
            payer,
            viewing_pubkey,
            tree,
            offer_proof,
            spp_proof,
        } = self;

        let nullifier_pdas = nullifier_pda_accounts(
            &tree,
            spp_proof.inputs.iter().map(|input| &input.nullifier_hash),
        );
        let serialized_ix = wincode::serialize(&OfferIxData {
            proof: offer_proof,
            viewing_pubkey,
            authority_bump: loan_authority_bump(&payer),
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
        // The owner signers: the lender for the source it spends, then the
        // lender's order authority for the data-bearing order output, which
        // the program signs for during the CPI.
        accounts.push(AccountMeta::new_readonly(payer, true));
        accounts.push(AccountMeta::new_readonly(
            loan_authority_pda(&payer),
            false,
        ));
        let mut instruction_data = vec![tag::OFFER];
        instruction_data.extend_from_slice(&serialized_ix);
        Ok(Instruction {
            program_id: loan_program::ID,
            accounts,
            data: instruction_data,
        })
    }
}

#[cfg(test)]
mod tests {
    use solana_keypair::Keypair;
    use spr_keypair::ShieldedKeypair;

    use super::*;

    /// The marker message's data is the `MarkerData` bytes the program
    /// compares against, and its view tag is the borrower's.
    #[test]
    fn order_marker_message_is_the_program_marker() {
        let borrower_address = ShieldedKeypair::from_keypair(&Keypair::new_from_array([13u8; 32]))
            .expect("borrower keypair")
            .shielded_address()
            .expect("borrower address");
        let marker = MarkerData {
            offer_utxo_hash: [5; 32],
            lender_pubkey: [7; 32],
        };
        let message = OfferMarker {
            offer_utxo_hash: marker.offer_utxo_hash,
            lender_pubkey: Pubkey::new_from_array(marker.lender_pubkey),
            borrower_address,
        }
        .message()
        .expect("marker message");
        assert_eq!(
            message,
            MessageData {
                view_tag: borrower_address
                    .signing_pubkey
                    .confidential_view_tag()
                    .expect("view tag"),
                data: borsh::to_vec(&marker).expect("serialize marker"),
            }
        );
    }
}
