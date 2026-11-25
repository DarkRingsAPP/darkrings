mod instruction;
mod transaction;

pub use instruction::Claim;
pub use transaction::{ClaimTransaction, ClaimTransactionParams, COLLATERAL_OUTPUT_SLOT};
