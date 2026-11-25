use crate::shared::*;
use loan_program::verifier::originate::{PublicInputs, Verifier, VERIFYINGKEY};
use loan_sdk::{
    instructions::originate::{LOAN_OUTPUT_SLOT, PRINCIPAL_OUTPUT_SLOT},
    proof::CircuitId,
};

const CIRCUIT: CircuitId = CircuitId::Originate;

fn inputs(designated: bool) -> (Originate, loan_sdk::state::OfferUtxo) {
    let lender = keypair();
    let borrower = keypair();
    let designated_borrower = designated.then(|| identity_of(&borrower));
    let offer = offer_utxo(terms(&lender, designated_borrower));
    (originate_inputs(&offer, borrower), offer)
}

#[test]
fn program_vk_has_one_public_input() {
    assert_eq!(VERIFYINGKEY.nr_pubinputs, 1);
    assert!(VERIFYINGKEY.vk_commitment.is_none());
    assert_eq!(VERIFYINGKEY.vk_ic.len(), 2);
}

#[test]
fn designated_originate_proves_and_binds_public_inputs() {
    // 1. Check the principal goes to the borrower and the collateral into
    // the loan UTXO under the lender's loan authority, with the loan terms
    // committed.
    let (inputs, offer) = inputs(true);
    let finalized = inputs.create_finalized_transaction().unwrap();
    let outputs = finalized.output_utxos();
    let principal = outputs.get(PRINCIPAL_OUTPUT_SLOT).unwrap();
    assert_eq!(
        (principal.owner_address, principal.asset, principal.amount),
        (
            Some(inputs.sender_address()),
            principal_mint(),
            PRINCIPAL_AMOUNT
        )
    );
    let loan = outputs.get(LOAN_OUTPUT_SLOT).unwrap();
    assert_eq!(
        (
            loan.owner_address.unwrap().owner_hash().unwrap(),
            loan.asset,
            loan.amount,
            loan.data_hash.is_some(),
        ),
        (
            offer.terms.loan_authority().unwrap().owner_hash().unwrap(),
            collateral_mint(),
            COLLATERAL_AMOUNT,
            true,
        )
    );

    // 2. Prove, and verify with the program's public inputs; another
    // expiry, first nullifier, loan owner or transaction fails.
    let (_, proof) = prove_and_verify(CIRCUIT, &inputs, &VERIFYINGKEY);
    let private_tx_hash = finalized.padding_independent_private_tx_hash().unwrap();
    let first_nullifier = field_bytes(inputs.program.public.first_nullifier);
    let loan_owner = loan_owner_hash(&offer);
    assert!(verify(
        &proof,
        EXPIRY,
        first_nullifier,
        loan_owner,
        &private_tx_hash
    ));
    let mut tampered = private_tx_hash;
    tampered[31] ^= 0x01;
    assert!(!verify(&proof, EXPIRY + 1, first_nullifier, loan_owner, &private_tx_hash));
    assert!(!verify(&proof, EXPIRY, [9; 32], loan_owner, &private_tx_hash));
    assert!(!verify(&proof, EXPIRY, first_nullifier, [9; 32], &private_tx_hash));
    assert!(!verify(&proof, EXPIRY, first_nullifier, loan_owner, &tampered));
}

#[test]
fn open_offer_is_originated_by_an_arbitrary_borrower() {
    let (inputs, _) = inputs(false);
    prove_and_verify(CIRCUIT, &inputs, &VERIFYINGKEY);
}

#[test]
fn designated_offer_rejects_another_borrower() {
    let lender = keypair();
    let offer = offer_utxo(terms(&lender, Some(identity_of(&keypair()))));
    let inputs = originate_inputs(&offer, keypair());
    assert_invalid(CIRCUIT, &inputs);
}

#[test]
fn originate_rejects_an_unrecoverable_blinding_seed_and_first_nullifier() {
    let mutations: [fn(&mut Originate); 2] = [
        |inputs| inputs.program.private.tx_context = context(&fe(77)),
        |inputs| inputs.program.public.first_nullifier = field(88),
    ];
    for mutate in mutations {
        let (mut inputs, _) = self::inputs(true);
        mutate(&mut inputs);
        assert_invalid(CIRCUIT, &inputs);
    }
}

#[test]
fn originate_rejects_wrong_terms_and_collateral_input() {
    let mutations: [fn(&mut Originate); 6] = [
        // Another expiry than the committed one.
        |inputs| inputs.program.public.expiry = EXPIRY + 1,
        // A collateral input of the wrong asset.
        |inputs| {
            let collateral = wallet_utxo(&inputs.sender, principal_mint(), COLLATERAL_AMOUNT);
            let converted = inputs.utxo(&collateral);
            inputs.program.private.collateral_in = converted;
        },
        // A collateral input short of the collateral amount.
        |inputs| {
            let collateral =
                wallet_utxo(&inputs.sender, collateral_mint(), COLLATERAL_AMOUNT - 1);
            let converted = inputs.utxo(&collateral);
            inputs.program.private.collateral_in = converted;
        },
        // A tampered offer data hash.
        |inputs| inputs.program.private.offer_utxo.data_hash = field(99),
        // An empty offer.
        |inputs| inputs.program.private.offer_utxo.amount = 0,
        // A tampered committed repay amount.
        |inputs| inputs.program.private.terms.repay_amount += 1,
    ];
    for mutate in mutations {
        let (mut inputs, _) = self::inputs(true);
        mutate(&mut inputs);
        assert_invalid(CIRCUIT, &inputs);
    }
}

#[test]
fn borrower_recovers_principal_without_settlement_ciphertext() {
    // The principal output derives from the offer opening and the first
    // nullifier alone.
    let lender = keypair();
    let borrower = keypair();
    let offer = offer_utxo(terms(&lender, None));
    let inputs = originate_inputs(&offer, borrower);
    let finalized = inputs.create_finalized_transaction().unwrap();
    let first_nullifier = finalized.first_nullifier().unwrap();
    let principal = finalized
        .output_utxos()
        .get(PRINCIPAL_OUTPUT_SLOT)
        .unwrap()
        .clone();
    let derived = offer
        .derived_principal_output(&first_nullifier, inputs.sender_address())
        .unwrap();
    assert_eq!(
        principal.hash(OUTPUT_TREE_ID).unwrap(),
        derived.hash(OUTPUT_TREE_ID).unwrap()
    );
}

/// The loan UTXO address hash the program computes: the lender's loan
/// authority with the lender's viewing key.
fn loan_owner_hash(offer: &loan_sdk::state::OfferUtxo) -> [u8; 32] {
    spr_program::verifier::address_hash(
        &offer.terms.loan_authority().unwrap().owner_hash().unwrap(),
        offer.terms.lender.viewing_pubkey.as_bytes(),
    )
    .unwrap()
}

fn verify(
    proof: &spr_program::CompressedProof,
    expiry: u64,
    first_nullifier: [u8; 32],
    loan_owner: [u8; 32],
    private_tx_hash: &[u8; 32],
) -> bool {
    Verifier {
        proof,
        public_inputs: PublicInputs {
            expiry,
            first_nullifier,
            loan_owner,
        },
        private_tx_hash,
        transfers: &[],
    }
    .verify()
    .is_ok()
}
