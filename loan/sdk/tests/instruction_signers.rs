use solana_address::Address;
use solana_instruction::AccountMeta;
use spr_interface::{
    instruction::{
        instruction_data::transact::{
            InputUtxo, OwnerTag, TransactIxData, TransactOutput, TreeContext,
        },
        CircuitId, TransactProof,
    },
    N_PUBLIC_SLOTS,
};
use spr_program::instruction::Transact;
use loan_sdk::{
    instructions::{offer::Offer, originate::Originate},
    loan_authority_pda, OfferProof, OriginateProof,
};

/// A transact of `inputs` inputs and two outputs.
fn transact(inputs: u8) -> TransactIxData {
    TransactIxData {
        expiry_unix_ts: u64::MAX,
        private_tx_hash: [0; 32],
        circuit: CircuitId::ConfidentialSigner(inputs, 2, N_PUBLIC_SLOTS as u8),
        tx_viewing_pk: [2; 33],
        salt: [0; 16],
        proof: TransactProof::zeroed(),
        inputs: (1..=inputs)
            .map(|value| InputUtxo {
                nullifier_hash: [value; 32],
                tree_index: 0,
            })
            .collect(),
        interface_transfers: Vec::new(),
        data_hash: None,
        ring_data_hash: None,
        outputs: [3, 4]
            .map(|value| TransactOutput {
                utxo_hash: [value; 32],
                owner_tag: OwnerTag::Inline([value; 32]),
                data: None,
            })
            .to_vec(),
        messages: Vec::new(),
        tree_contexts: vec![TreeContext {
            utxo_tree_root_index: 0,
            nullifier_tree_root_index: 0,
        }],
    }
}

/// The SPP accounts of `data` with `owner_signers`, where `lender`'s order
/// authority does not sign at transaction entry: the swap program supplies
/// its signature during the CPI.
fn spp_accounts(
    lender: &Address,
    payer: Address,
    tree: Address,
    owner_signers: Vec<Address>,
    data: TransactIxData,
) -> Vec<AccountMeta> {
    let mut accounts = Transact {
        payer,
        input_trees: vec![tree],
        output_tree: tree,
        owner_signers,
        interface_transfer_accounts: Vec::new(),
        data,
    }
    .instruction()
    .accounts;
    for account in &mut accounts {
        if account.pubkey == loan_authority_pda(lender) {
            account.is_signer = false;
        }
    }
    accounts
}

#[test]
fn make_forwards_the_paying_maker_and_loan_authority_as_owner_signers() {
    // The lender owns the spent source; its order authority owns the
    // data-bearing order output.
    let payer = Address::new_unique();
    let tree = Address::new_unique();
    let data = transact(1);
    let expected = spp_accounts(
        &payer,
        payer,
        tree,
        vec![payer, loan_authority_pda(&payer)],
        data.clone(),
    );
    let instruction = Offer {
        payer,
        viewing_pubkey: [2; 33],
        tree,
        spp_proof: data,
        offer_proof: OfferProof {
            a: [0; 32],
            b: [0; 64],
            c: [0; 32],
        },
    }
    .instruction()
    .expect("offer");
    assert_eq!(
        instruction.accounts.first(),
        Some(&AccountMeta::new(payer, true))
    );
    assert_eq!(instruction.accounts.get(1..), Some(expected.as_slice()));
}

#[test]
fn take_forwards_the_order_and_paying_taker_as_owner_signers() {
    // The lender's order authority owns the order input; the borrower owns its
    // destination input.
    let payer = Address::new_unique();
    let lender = Address::new_unique();
    let tree = Address::new_unique();
    let data = transact(2);
    let expected = spp_accounts(
        &lender,
        payer,
        tree,
        vec![loan_authority_pda(&lender), payer],
        data.clone(),
    );
    let instruction = Originate {
        payer,
        lender,
        viewing_pubkey: [2; 33],
        tree,
        spp_proof: data,
        originate_proof: OriginateProof {
            a: [0; 32],
            b: [0; 64],
            c: [0; 32],
        },
    }
    .instruction()
    .expect("originate");
    assert_eq!(
        instruction.accounts.first(),
        Some(&AccountMeta::new(payer, true))
    );
    assert_eq!(instruction.accounts.get(1..), Some(expected.as_slice()));
}
