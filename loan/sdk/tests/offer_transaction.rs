//! The make transaction the SDK builder produces: its SPP shape, the order of
//! its outputs and its one message, the borrower's marker. The program checks
//! the marker and reads the order UTXO hash from `OFFER_SLOT`.

#[path = "../../../test-utils/utxo.rs"]
mod utxo;
use solana_keypair::Keypair;
use spr_interface::{instruction::instruction_data::transact::MessageData, shape::Shape};
use spr_keypair::ShieldedKeypair;
use spr_transaction::{Data, Mint, Utxo};
use loan_sdk::{
    instructions::offer::{OfferTransactionParams, CHANGE_SLOT, OFFER_SLOT},
    shared::identity,
    state::OfferTerms,
    MarkerData,
};

const TREE_ID: u16 = 7;
const SOURCE: u64 = 1_000;
const LOCKED: u64 = 400;

fn keypair(seed: u8) -> ShieldedKeypair {
    ShieldedKeypair::from_keypair(&Keypair::new_from_array([seed; 32])).unwrap()
}

#[test]
fn make_transaction_spends_one_source_into_change_then_order_with_one_marker() {
    let lender = keypair(7);
    let borrower = keypair(13);
    let maker_address = lender.shielded_address().unwrap();
    let borrower_address = borrower.shielded_address().unwrap();
    let lender_pubkey = maker_address.solana_address().unwrap();
    let principal_mint = Mint::new(solana_address::Address::new_from_array([3; 32]), 2);
    // A wallet UTXO of `principal_mint` owned by the lender.
    let wallet = |amount, blinding| {
        utxo::wallet_utxo(
            Utxo {
                owner: lender.signing_pubkey(),
                asset: principal_mint,
                amount,
                blinding,
                ring_program_id: None,
                data: Data::default(),
            },
            &lender.nullifier_key,
            TREE_ID,
            0,
        )
    };
    let source = wallet(SOURCE, [5; 32]);
    let terms = OfferTerms {
        repay_amount: 1_100,
        deadline: 1_700_600_000,
        collateral_mint: Mint::SOL,
        collateral_amount: 250,
        lender: maker_address,
        expiry: 2_000_000_000,
        borrower: Some(identity(&borrower_address.solana_address().unwrap()).unwrap()),
    };

    let transaction = OfferTransactionParams {
        terms,
        principal_amount: LOCKED,
        source,
        borrower_address,
        payer: lender_pubkey,
    }
    .build(&lender)
    .unwrap();
    let spp = &transaction.spp_proof_inputs;

    // 1. The 1-in/2-out transact of the spec: the source in, two outputs.
    assert_eq!(spp.check_shape().unwrap(), Shape::IN1_OUT2);

    // 2. The change to the lender comes first, then the order UTXO.
    let change_hash = wallet(SOURCE - LOCKED, transaction.change_blinding).utxo_hash;
    let order_hash = transaction.offer_utxo.hash(TREE_ID).unwrap();
    let output_hashes: Vec<[u8; 32]> = spp
        .external_data
        .outputs
        .iter()
        .map(|output| output.utxo_hash)
        .collect();
    assert_eq!((CHANGE_SLOT, OFFER_SLOT), (0, 1));
    assert_eq!(output_hashes, vec![change_hash, order_hash]);

    // 3. Exactly one message: the marker of the order output and the lender,
    // tagged to the borrower.
    let marker = MessageData {
        view_tag: borrower_address
            .signing_pubkey
            .confidential_view_tag()
            .unwrap(),
        data: borsh::to_vec(&MarkerData {
            offer_utxo_hash: order_hash,
            lender_pubkey: lender_pubkey.to_bytes(),
        })
        .unwrap(),
    };
    assert_eq!(spp.external_data.messages, vec![marker]);
}
