use crate::shared::*;
use spr_keypair::{ShieldedAddress, ShieldedKeypair};
use loan_program::{
    instructions::shared::LoanAuthority,
    verifier::offer::{PublicInputs, Verifier, VERIFYINGKEY},
};
use loan_sdk::{
    instructions::offer::{CHANGE_SLOT, OFFER_SLOT},
    loan_authority, loan_authority_bump,
    proof::CircuitId,
};

const CIRCUIT: CircuitId = CircuitId::Offer;

#[test]
fn program_vk_has_one_public_input() {
    assert_eq!(VERIFYINGKEY.nr_pubinputs, 1);
    assert!(VERIFYINGKEY.vk_commitment.is_none());
    assert_eq!(
        VERIFYINGKEY.vk_ic.len(),
        2,
        "standard Groth16 vk_ic length must be public_inputs + 1"
    );
}

#[test]
fn offer_prove_verify() {
    // 1. Check the change returns to the lender, the source owner, and the
    // order UTXO commits the terms with the lender as their lender.
    let mut inputs = offer_inputs(PRINCIPAL_AMOUNT, 750);
    let terms = committed_offer_terms(&mut inputs);
    let finalized = inputs.create_finalized_transaction().unwrap();
    let outputs = finalized.output_utxos();
    let change = outputs.get(CHANGE_SLOT).unwrap();
    let offer = outputs.get(OFFER_SLOT).unwrap();
    assert_eq!(
        (
            change.owner_address,
            change.asset,
            change.amount,
            change.data_hash
        ),
        (Some(inputs.sender_address()), principal_mint(), 750, None)
    );
    let terms_hash = spr_program::circuit::DataHash::hash(&terms).unwrap();
    let lender_pubkey = inputs.sender_address().solana_address().unwrap();
    assert_eq!(
        (
            offer.owner_address.unwrap().owner_hash().unwrap(),
            offer.asset,
            offer.amount,
            offer.data_hash,
        ),
        (
            loan_authority(&lender_pubkey).owner_hash().unwrap(),
            principal_mint(),
            PRINCIPAL_AMOUNT,
            Some(spr_program::hasher::data_hash(&field_bytes(terms_hash)).unwrap()),
        )
    );

    // 2. Prove, and verify with the program's public inputs for the lender
    // signer and the order's viewing key, and the transaction it commits;
    // another signer, viewing key or transaction fails.
    let (_, proof) = prove_and_verify(CIRCUIT, &inputs, &VERIFYINGKEY);
    let private_tx_hash = finalized.padding_independent_private_tx_hash().unwrap();
    let viewing_pubkey = *inputs.public.offer_owner.viewing_pubkey();
    let program_verify = |signer: &ShieldedAddress, viewing_pubkey, tx_hash| {
        verify(
            &proof,
            program_public_inputs(signer, viewing_pubkey),
            tx_hash,
        )
    };
    let signer = inputs.sender_address();
    assert!(program_verify(&signer, &viewing_pubkey, &private_tx_hash));
    let mut tampered = private_tx_hash;
    tampered[31] ^= 0x01;
    assert!(!program_verify(&signer, &viewing_pubkey, &tampered));
    let other = keypair().shielded_address().unwrap();
    assert!(!program_verify(&other, &viewing_pubkey, &private_tx_hash));
    assert!(!program_verify(
        &signer,
        other.viewing_pubkey.as_bytes(),
        &private_tx_hash
    ));
}

/// SPP accepts a data-bearing output owned by any owner signer, so a lender
/// can make an order UTXO it owns itself, or one under another lender's order
/// authority, and prove the make for that owner. The proof is valid for its
/// own `offer_owner`, but the program derives `offer_owner` from the lender
/// signer's order authority, and the proof fails against it.
#[test]
fn offer_not_owned_by_the_lenders_loan_authority_is_rejected() {
    let borrower = keypair();
    let owners: [fn(&Offer, &ShieldedKeypair) -> ShieldedAddress; 2] = [
        // The lender itself, with the borrower's viewing key.
        |inputs, borrower| ShieldedAddress {
            viewing_pubkey: borrower.viewing_pubkey(),
            ..inputs.sender_address()
        },
        // The lender's order authority, under another lender's.
        |_, borrower| offer_address(&keypair(), borrower),
    ];
    for owner in owners {
        let mut inputs = offer_inputs(PRINCIPAL_AMOUNT, 750);
        let offer_owner = owner(&inputs, &borrower);
        inputs.public.offer_owner = inputs.address(offer_owner);

        // 1. The order output is owned by `offer_owner`, and the proof is
        // valid for it.
        let finalized = inputs.create_finalized_transaction().unwrap();
        let offer = finalized.output_utxos().get(OFFER_SLOT).unwrap().clone();
        assert_eq!(offer.owner_address, Some(offer_owner));
        let (_, proof) = prove_and_verify(CIRCUIT, &inputs, &VERIFYINGKEY);
        let private_tx_hash = finalized.padding_independent_private_tx_hash().unwrap();
        let viewing_pubkey = offer_owner.viewing_pubkey.as_bytes();
        let signer = inputs.sender_address();
        let claimed = PublicInputs {
            offer_owner: spr_program::verifier::address_hash(
                &offer_owner.owner_hash().unwrap(),
                viewing_pubkey,
            )
            .unwrap(),
            ..program_public_inputs(&signer, viewing_pubkey)
        };
        assert!(verify(&proof, claimed, &private_tx_hash));

        // 2. The program's public inputs reject it.
        assert!(!verify(
            &proof,
            program_public_inputs(&signer, viewing_pubkey),
            &private_tx_hash
        ));
    }
}

#[test]
fn offer_zero_change_proves() {
    // A zero change is still a real output before the order UTXO.
    let inputs = offer_inputs(PRINCIPAL_AMOUNT, 0);
    let finalized = inputs.create_finalized_transaction().unwrap();
    let change = finalized.output_utxos().get(CHANGE_SLOT).unwrap();
    assert_eq!((change.amount, change.compact), (0, false));
    prove_and_verify(CIRCUIT, &inputs, &VERIFYINGKEY);
}

#[test]
fn offer_rejects_invalid_offers() {
    // A zero order or destination amount, an order beyond the source, or a
    // signer other than the source owner.
    let mutations: [fn(&mut Offer); 4] = [
        |inputs| inputs.program.private.collateral_amount = 0,
        |inputs| inputs.program.private.principal_amount = 0,
        |inputs| inputs.program.private.principal_amount = PRINCIPAL_AMOUNT + 751,
        |inputs| inputs.program.public.lender_owner_pk_field = field(89),
    ];
    for mutate in mutations {
        let mut inputs = offer_inputs(PRINCIPAL_AMOUNT, 750);
        mutate(&mut inputs);
        assert_invalid(CIRCUIT, &inputs);
    }
}

/// The public inputs the program computes for the lender signer `signer` and
/// the order's `viewing_pubkey` from the make arguments.
fn program_public_inputs(signer: &ShieldedAddress, viewing_pubkey: &[u8; 33]) -> PublicInputs {
    let lender = signer.solana_address().unwrap();
    LoanAuthority::new(&lender.to_bytes(), loan_authority_bump(&lender))
        .unwrap()
        .offer_public_inputs(viewing_pubkey)
        .unwrap()
}

fn verify(
    proof: &spr_program::CompressedProof,
    public_inputs: PublicInputs,
    private_tx_hash: &[u8; 32],
) -> bool {
    Verifier {
        proof,
        public_inputs,
        private_tx_hash,
        transfers: &[],
    }
    .verify()
    .is_ok()
}
