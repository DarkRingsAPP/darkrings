use solana_program_error::ProgramError;
use spr_hasher::HasherError;
use thiserror::Error;

#[derive(Clone, Copy, Debug, Error, PartialEq, Eq)]
#[repr(u32)]
pub enum LoanError {
    #[error("offer has expired")]
    Expired = 8005,
    #[error("window has not yet opened")]
    NotYetExpired = 8006,
    #[error("proof verification failed")]
    ProofVerificationFailed = 8007,
    #[error("instruction data is invalid")]
    InvalidInstructionData = 8011,
    #[error("shielded-pool program account is invalid")]
    InvalidShieldedPoolProgram = 8012,
    #[error("loan-authority account is missing from the transact account list")]
    MissingLoanAuthority = 8013,
    #[error("offer transact must carry exactly one marker message")]
    InvalidMarkerMessage = 8014,
    #[error("offer marker message data must be the offer UTXO hash and the lender")]
    InvalidMarkerData = 8015,
    #[error("hashing failed")]
    HashingFailed = 8016,
    #[error("authority bump does not derive the lender's loan-authority PDA")]
    InvalidLoanAuthorityBump = 8017,
}

impl From<LoanError> for ProgramError {
    fn from(error: LoanError) -> Self {
        ProgramError::Custom(error as u32)
    }
}

impl From<HasherError> for LoanError {
    fn from(_: HasherError) -> Self {
        Self::HashingFailed
    }
}

/// A public input that does not encode as a field element fails hashing; a
/// proof that does not verify fails verification.
impl From<spr_program::verifier::VerifyError> for LoanError {
    fn from(error: spr_program::verifier::VerifyError) -> Self {
        match error {
            spr_program::verifier::VerifyError::PublicInputs => Self::HashingFailed,
            spr_program::verifier::VerifyError::Proof => Self::ProofVerificationFailed,
        }
    }
}
