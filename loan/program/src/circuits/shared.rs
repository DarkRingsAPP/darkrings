use spr_program::{
    circuit::{DataUtxo, Utxo, UtxoTrait},
    poseidon, require, require_eq, CircuitError, Field, TxContext,
};

use super::{LoanTerms, OfferTerms};

/// The transaction's blinding seed is `Poseidon(tag, utxo_blinding)`, so
/// anyone holding the spent data UTXO's opening derives every output blinding
/// from the seed and the first nullifier.
pub(super) fn assert_blinding_seed(
    context: &TxContext,
    tag: u32,
    utxo_blinding: &Field,
) -> Result<(), CircuitError> {
    require_eq(
        context.blinding_seed,
        poseidon(&[Field::from(tag), *utxo_blinding])?,
    );
    Ok(())
}

/// Spends the offer UTXO, which commits `terms` and holds a nonzero amount
/// (the principal), and leaves no output. The owner stays a free witness:
/// SPP spends the offer UTXO only with the loan-authority PDA signature.
pub(super) fn spend_offer(
    input: &Utxo,
    terms: &OfferTerms,
) -> Result<DataUtxo<OfferTerms>, CircuitError> {
    let offer = DataUtxo::new_mut(input, terms)?.close();
    require(offer.amount()? != 0);
    Ok(offer)
}

/// Spends the loan UTXO, which commits `terms` and holds a nonzero amount
/// (the collateral), and leaves no output. The owner stays a free witness:
/// SPP spends the loan UTXO only with the loan-authority PDA signature.
pub(super) fn spend_loan(
    input: &Utxo,
    terms: &LoanTerms,
) -> Result<DataUtxo<LoanTerms>, CircuitError> {
    let loan = DataUtxo::new_mut(input, terms)?.close();
    require(loan.amount()? != 0);
    Ok(loan)
}
