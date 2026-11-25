use crate::shared::*;
use loan_program::verifier::repay::{PublicInputs, Verifier, VERIFYINGKEY};
use loan_sdk::{
    instructions::repay::{COLLATERAL_OUTPUT_SLOT, REPAYMENT_OUTPUT_SLOT},
    proof::CircuitId,
};

const CIRCUIT: CircuitId = CircuitId::Repay;

fn inputs() -> (Repay, loan_sdk::state::LoanUtxo) {
    let lender = keypair();
    let borrower = keypair();
    let loan = loan_utxo(&lender, &borrower);
    (repay_inputs(&loan, borrower), loan)
}

#[test]
fn program_vk_has_one_public_input() {
    assert_eq!(VERIFYINGKEY.nr_pubinputs, 1);
    assert!(VERIFYINGKEY.vk_commitment.is_none());
    assert_eq!(VERIFYINGKEY.vk_ic.len(), 2);
}

#[test]
fn repay_proves_and_binds_public_inputs() {
    // 1. Check the collateral returns to the borrower and the repayment
    // goes to the lender.
    let (inputs, loan) = inputs();
    let finalized = inputs.create_finalized_transaction().unwrap();
    let outputs = finalized.output_utxos();
    let collateral = outputs.get(COLLATERAL_OUTPUT_SLOT).unwrap();
    assert_eq!(
        (collateral.asset, collateral.amount),
        (collateral_mint(), COLLATERAL_AMOUNT)
    );
    let repayment = outputs.get(REPAYMENT_OUTPUT_SLOT).unwrap();
    assert_eq!(
        (
            repayment.owner_address,
            repayment.asset,
            repayment.amount
        ),
        (Some(loan.terms.lender), principal_mint(), REPAY_AMOUNT)
    );

    // 2. Prove, and verify with the program's public inputs; another
    // deadline, first nullifier or transaction fails.
    let (_, proof) = prove_and_verify(CIRCUIT, &inputs, &VERIFYINGKEY);
    let private_tx_hash = finalized.padding_independent_private_tx_hash().unwrap();
    let first_nullifier = field_bytes(inputs.program.public.first_nullifier);
    assert!(verify(&proof, DEADLINE, first_nullifier, &private_tx_hash));
    let mut tampered = private_tx_hash;
    tampered[31] ^= 0x01;
    assert!(!verify(&proof, DEADLINE + 1, first_nullifier, &private_tx_hash));
    assert!(!verify(&proof, DEADLINE, [9; 32], &private_tx_hash));
    assert!(!verify(&proof, DEADLINE, first_nullifier, &tampered));
}

#[test]
fn lender_recovers_repayment_without_settlement_ciphertext() {
    let (inputs, loan) = inputs();
    let finalized = inputs.create_finalized_transaction().unwrap();
    let first_nullifier = finalized.first_nullifier().unwrap();
    let repayment = finalized
        .output_utxos()
        .get(REPAYMENT_OUTPUT_SLOT)
        .unwrap()
        .clone();
    let derived = loan.derived_repayment_output(&first_nullifier).unwrap();
    assert_eq!(
        repayment.hash(OUTPUT_TREE_ID).unwrap(),
        derived.hash(OUTPUT_TREE_ID).unwrap()
    );
}

#[test]
fn repay_rejects_wrong_terms_borrower_and_inputs() {
    let mutations: [fn(&mut Repay); 6] = [
        // Another deadline than the committed one.
        |inputs| inputs.program.public.deadline = DEADLINE + 1,
        // A repay input of the wrong asset.
        |inputs| {
            let repay = wallet_utxo(&inputs.sender, collateral_mint(), REPAY_AMOUNT);
            let converted = inputs.utxo(&repay);
            inputs.program.private.repay_in = converted;
        },
        // A repay input short of the repay amount.
        |inputs| {
            let repay = wallet_utxo(&inputs.sender, principal_mint(), REPAY_AMOUNT - 1);
            let converted = inputs.utxo(&repay);
            inputs.program.private.repay_in = converted;
        },
        // Another borrower's repay input.
        |inputs| {
            let other = keypair();
            let repay = wallet_utxo(&other, principal_mint(), REPAY_AMOUNT);
            let converted = inputs.utxo(&repay);
            inputs.program.private.repay_in = converted;
        },
        // A tampered loan data hash.
        |inputs| inputs.program.private.loan_utxo.data_hash = field(99),
        // An unrecoverable blinding seed.
        |inputs| inputs.program.private.tx_context = context(&fe(77)),
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
    first_nullifier: [u8; 32],
    private_tx_hash: &[u8; 32],
) -> bool {
    Verifier {
        proof,
        public_inputs: PublicInputs {
            deadline,
            first_nullifier,
        },
        private_tx_hash,
        transfers: &[],
    }
    .verify()
    .is_ok()
}
