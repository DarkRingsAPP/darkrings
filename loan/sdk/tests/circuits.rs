//! Circuit tests: each proves with the checksum-pinned artifacts in
//! `target/zk/loan-program`, built by `zolana zk compile --test`, and checks
//! the proof with the committed verifiers.
mod cancel_circuit;
mod claim_circuit;
mod offer_circuit;
mod originate_circuit;
mod repay_circuit;
mod shared;
#[path = "../../../test-utils/utxo.rs"]
mod utxo;

#[test]
fn circuits_encode_only_their_specified_utxo_inputs() {
    // 1. Inspect the fixed input schema passed to each compiled circuit.
    let lender = shared::keypair();
    let borrower = shared::keypair();
    let offer = shared::offer_utxo(shared::terms(&lender, None));
    let loan = shared::loan_utxo(&lender, &borrower);
    let cases = [
        (
            "offer",
            shared::offer_inputs(shared::PRINCIPAL_AMOUNT, 750)
                .create_program_transaction()
                .unwrap()
                .proof_inputs
                .encoded(),
            1,
        ),
        (
            "originate",
            shared::originate_inputs(&offer, shared::keypair())
                .create_program_transaction()
                .unwrap()
                .proof_inputs
                .encoded(),
            2,
        ),
        (
            "repay",
            shared::repay_inputs(&loan, borrower)
                .create_program_transaction()
                .unwrap()
                .proof_inputs
                .encoded(),
            2,
        ),
        (
            "claim",
            shared::claim_inputs(&loan, lender)
                .create_program_transaction()
                .unwrap()
                .proof_inputs
                .encoded(),
            1,
        ),
        (
            "cancel",
            shared::cancel_inputs()
                .create_program_transaction()
                .unwrap()
                .proof_inputs
                .encoded(),
            1,
        ),
    ];

    // 2. Reject unused UTXO inputs introduced by a padding default.
    for (name, leaves, expected) in cases {
        let inputs = leaves
            .keys()
            .filter(|name| name.ends_with(".domain"))
            .count();
        assert_eq!(inputs, expected, "{name} encodes unexpected input UTXOs");
    }
}
