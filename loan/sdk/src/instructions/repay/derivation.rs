use anyhow::Result;
use spr_program::{poseidon, Field};

use crate::{err, shared::field};

/// The repay's blinding seed, `Poseidon(DRRP, loan_blinding)`, which the
/// repay circuit enforces. Lender and borrower both hold the loan opening,
/// so either derives every repay output from it and the repay's first
/// nullifier.
pub fn repay_blinding_seed(loan_blinding: &[u8; 32]) -> Result<[u8; 32]> {
    let seed = poseidon(&[
        Field::from(loan_program::REPAY_BLINDING_DOMAIN),
        field(*loan_blinding)?,
    ])
    .map_err(err)?;
    Ok(spr_program::to_bytes(&seed))
}
