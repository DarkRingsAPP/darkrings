use borsh::{BorshDeserialize, BorshSerialize};
use spr_program::{
    input, poseidon, require, require_eq, Asset, CircuitError, ClientInputs, Field, UtxoOwner,
    UtxoState,
};

/// The offer terms, the offer UTXO's state (`DataUtxo<OfferTerms>`). The
/// offer UTXO holds the locked principal; its asset and amount are the
/// principal's. The SDK hashes the terms into the data hash and encrypts
/// them as the offer UTXO's data (to the borrower's viewing key, so the
/// designated borrower discovers the offer).
#[input]
#[derive(Default, PartialEq, Eq, BorshSerialize, BorshDeserialize, UtxoState, ClientInputs)]
pub struct OfferTerms {
    /// The mint the borrower must post as collateral.
    pub collateral_mint: Asset,
    pub collateral_amount: u64,
    /// What the borrower repays (principal + interest), in the principal's
    /// mint, to reclaim the collateral before `deadline`.
    pub repay_amount: u64,
    /// Unix seconds; the absolute repay-by time of the loan once originated.
    pub deadline: u64,
    /// The lender, the owner of the source the offer spends: receives the
    /// repayment, claims the collateral on default, reclaims the principal on
    /// cancel, and its signing key signs the cancel.
    pub lender: UtxoOwner,
    /// Unix seconds; the offer's own expiry. Revealed at originate and cancel
    /// and checked against the Clock by the program.
    pub expiry: u64,
    /// The designated borrower's owner identity (`solana_owner_identity` of
    /// its Solana address) as 32 big-endian bytes, or zero for an offer
    /// anyone holding the opening may originate.
    pub borrower_pk_fe: [u8; 32],
}

impl OfferTerms {
    /// Amounts are nonzero; the `u64` inputs are range-checked on entry.
    pub(super) fn assert_valid(&self) {
        require(self.collateral_amount != 0);
        require(self.repay_amount != 0);
    }

    /// An open offer (`borrower_pk_fe == 0`) accepts any borrower; otherwise
    /// the collateral input's owner must be
    /// `Poseidon(borrower_pk_fe, nullifier_pk)`, with the input owner's own
    /// nullifier public key. One constraint:
    /// `borrower_pk_fe * (owner_hash - Poseidon(borrower_pk_fe, nullifier_pk)) == 0`.
    pub(super) fn assert_borrower(&self, borrower: &UtxoOwner) -> Result<(), CircuitError> {
        let borrower_pk_fe = self.borrower_pk_fe_field();
        let designated = poseidon(&[borrower_pk_fe, borrower.nullifier_pk()])?;
        require_eq(
            borrower_pk_fe * (borrower.hash()? - designated),
            Field::zero(),
        );
        Ok(())
    }

    /// `borrower_pk_fe` as a field element: its bytes packed big-endian, a
    /// linear combination with no constraint of its own.
    fn borrower_pk_fe_field(&self) -> Field {
        let mut packed = Field::zero();
        for byte in self.borrower_pk_fe.iter() {
            packed = packed * Field::from(256u64) + Field::from(*byte);
        }
        packed
    }
}

/// The loan terms, the loan UTXO's state (`DataUtxo<LoanTerms>`). The loan
/// UTXO holds the locked collateral; its asset and amount are the
/// collateral's. Encrypted to the lender's viewing key, so the lender
/// discovers its open loans; the borrower holds the opening from building
/// the originate transaction.
#[input]
#[derive(Default, PartialEq, Eq, BorshSerialize, BorshDeserialize, UtxoState, ClientInputs)]
pub struct LoanTerms {
    /// The repayment's mint: the principal the borrower received.
    pub principal_mint: Asset,
    /// What the borrower repays to reclaim the collateral.
    pub repay_amount: u64,
    /// Receives the repayment at repay, or the collateral at claim.
    pub lender: UtxoOwner,
    /// Receives the collateral back at repay; owned the collateral input.
    pub borrower: UtxoOwner,
    /// Unix seconds; repay requires `now <= deadline`, claim `now > deadline`.
    pub deadline: u64,
}
