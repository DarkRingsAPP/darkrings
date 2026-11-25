use loan_program::error::LoanError::*;

#[test]
fn error_codes_are_stable() {
    let table = [
        (Expired as u32, 8005),
        (NotYetExpired as u32, 8006),
        (ProofVerificationFailed as u32, 8007),
        (InvalidInstructionData as u32, 8011),
        (InvalidShieldedPoolProgram as u32, 8012),
        (MissingLoanAuthority as u32, 8013),
        (InvalidMarkerMessage as u32, 8014),
        (InvalidMarkerData as u32, 8015),
        (HashingFailed as u32, 8016),
        (InvalidLoanAuthorityBump as u32, 8017),
    ];
    for (got, want) in table {
        assert_eq!(got, want, "error code drifted");
    }
}
