use anyhow::Result;
use spr_program::{poseidon, Field};

use crate::{err, shared::field};

/// The take's blinding seed, `Poseidon(SWTX, order_blinding)`, which the take
/// circuit enforces. Lender and borrower both hold the order blinding, so either
/// derives every take output from it and the take's first nullifier.
pub fn originate_blinding_seed(order_blinding: &[u8; 32]) -> Result<[u8; 32]> {
    let seed = poseidon(&[
        Field::from(loan_program::ORIGINATE_BLINDING_DOMAIN),
        field(*order_blinding)?,
    ])
    .map_err(err)?;
    Ok(spr_program::to_bytes(&seed))
}
