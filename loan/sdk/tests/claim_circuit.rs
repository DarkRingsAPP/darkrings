use crate::shared::*;
use loan_program::verifier::claim::{PublicInputs, Verifier, VERIFYINGKEY};
use loan_sdk::{instructions::claim::COLLATERAL_OUTPUT_SLOT, proof::CircuitId};

const CIRCUIT: CircuitId = CircuitId::Claim;

fn inputs() -> (Claim, loan_sdk::state::LoanUtxo) {
    let lender = keypair();
    let borrower = keypair();
    let loan = loan_utxo(&lender, &borrower);
    (claim_inputs(&loan, lender), loan)
}

#[test]
fn program_vk_has_one_public_input() {
    assert_eq!(VERIFYINGKEY.nr_pubinputs, 1);
    assert!(VERIFYINGKEY.vk_commitment.is_none());
    assert_eq!(VERIFYINGKEY.vk_ic.len(), 2);
}

#[test]
fn claim_proves_and_binds_public_inputs() {
    // 1. Check the whole collateral goes to the lender.
    let (inputs, _) = inputs();
    let finalized = inputs.create_finalized_transaction().unwrap();
    let collateral = finalized
        .output_utxos()
        .get(COLLATERAL_OUTPUT_SLOT)
        .unwrap()
        .clone();
    assert_eq!(
        (
            collateral.owner_address,
            collateral.asset,
            collateral.amount
        ),
        (
            Some(inputs.sender_address()),
            collateral_mint(),
            COLLATERAL_AMOUNT
        )
    );

    // 2. Prove, and verify with the program's verifier from the loan
    // deadline and the lender signer; another deadline, signer or
    // transaction fails.
    let (_, proof) = prove_and_verify(CIRCUIT, &inputs, &VERIFYINGKEY);
    let private_tx_hash = finalized.padding_independent_private_tx_hash().unwrap();
    let signer = identity_of(&inputs.sender);
    assert!(verify(&proof, DEADLINE, signer, &private_tx_hash));
    let mut tampered = private_tx_hash;
    tampered[31] ^= 0x01;
    assert!(!verify(&proof, DEADLINE + 1, signer, &private_tx_hash));
    assert!(!verify(
        &proof,
        DEADLINE,
        identity_of(&keypair()),
        &private_tx_hash
    ));
    assert!(!verify(&proof, DEADLINE, signer, &tampered));
}

#[test]
fn claim_rejects_wrong_signer_deadline_and_loan() {
    let mutations: [fn(&mut Claim); 5] = [
        // Another deadline than the committed one.
        |inputs| inputs.program.public.deadline = DEADLINE + 1,
        // Another signer than the committed lender.
        |inputs| inputs.program.public.lender_owner_pk_field = field(89),
        // Another lender in the terms.
        |inputs| {
            let other = keypair().shielded_address().unwrap();
            let owner = *inputs.address(other).owner();
            inputs.program.private.terms.lender = owner;
        },
        // A tampered loan data hash.
        |inputs| inputs.program.private.loan_utxo.data_hash = field(99),
        // An empty loan.
        |inputs| inputs.program.private.loan_utxo.amount = 0,
    ];
    for mutate in mutations {
        let (mut inputs, _) = self::inputs();
        mutate(&mut inputs);
        assert_invalid(CIRCUIT, &inputs);
    }
}

fn verify(
    proof: &spr_program::CompressedProof,
    deadline: u64,
    lender_owner_pk_field: [u8; 32],
    private_tx_hash: &[u8; 32],
) -> bool {
    Verifier {
        proof,
        public_inputs: PublicInputs {
            deadline,
            lender_owner_pk_field,
        },
        private_tx_hash,
        transfers: &[],
    }
    .verify()
    .is_ok()
}
