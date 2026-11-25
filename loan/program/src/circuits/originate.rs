use spr_program::{
    circuit::{
        CheckedTransaction, ConfidentialTransaction, DataUtxo, PublicInputs, TokenUtxos, Utxo,
        UtxoTrait,
    },
    input, require_eq, CircuitError, ClientInputs, Field, ShieldedAddress, TxContext, ZkProgram,
};

use super::{
    shared::{assert_blinding_seed, spend_offer},
    LoanTerms, OfferTerms,
};

#[input]
#[derive(ZkProgram)]
pub struct Originate {
    pub private: OriginatePrivateInputs,
    pub public: OriginatePublicInputs,
}

#[input]
#[derive(ClientInputs)]
pub struct OriginatePrivateInputs {
    pub tx_context: TxContext,
    pub terms: OfferTerms,
    /// The offer UTXO, which commits `terms` and holds the principal.
    pub offer_utxo: Utxo,
    /// The borrower's collateral input. It must hold exactly the offer's
    /// `collateral_amount` of `collateral_mint`; its owner becomes the
    /// loan's borrower and receives the principal.
    pub collateral_in: Utxo,
}

#[input]
#[derive(PublicInputs)]
pub struct OriginatePublicInputs {
    /// The transact's `expiry_unix_ts`; the program checks `now <= expiry`.
    pub expiry: u64,
    /// The first SPP input's nullifier, which the program reads from the
    /// transact.
    pub first_nullifier: Field,
    /// The loan UTXO's address: the lender's loan-authority PDA with the
    /// lender's viewing key, so the lender can decrypt its loans. The
    /// program derives the PDA from the instruction's `lender` argument and
    /// hashes the address, so SPP spends the loan UTXO only with the
    /// program's signature.
    pub loan_owner: ShieldedAddress,
}

impl Originate {
    /// 1. Check the blinding seed derives from the offer opening.
    /// 2. Spend the offer UTXO, which commits the terms.
    /// 3. Check the offer terms and the public expiry.
    /// 4. Spend the collateral input: the collateral mint, the designated
    ///    borrower.
    /// 5. Pay the whole principal to the borrower and lock exactly
    ///    `collateral_amount` in the loan UTXO, owned by the public
    ///    `loan_owner`.
    /// 6. Set the loan terms from the offer and the borrower.
    /// 7. Check the transaction: inputs `[offer UTXO, collateral input]`,
    ///    outputs `[principal to borrower, loan UTXO]`.
    /// 8. Check the first nullifier the output blindings derive from is the
    ///    published one.
    pub fn execute(&self) -> Result<CheckedTransaction, CircuitError> {
        let private = &self.private;
        let public = &self.public;

        // 1. Both parties hold the offer opening. With the published first
        // nullifier, the seed makes every payout recoverable without the
        // borrower's ciphertext.
        assert_blinding_seed(
            &private.tx_context,
            crate::ORIGINATE_BLINDING_DOMAIN,
            &private.offer_utxo.blinding,
        )?;

        // 2. Spend the offer UTXO, which commits the terms.
        let mut offer = spend_offer(&private.offer_utxo, &private.terms)?;

        // 3. Check the offer terms and the public expiry.
        offer.assert_valid();
        require_eq(public.expiry, offer.expiry);

        // 4. Spend the collateral input and check the designated borrower.
        let mut collateral_in =
            TokenUtxos::new_mut(core::array::from_ref(&private.collateral_in))?.close();
        require_eq(collateral_in.asset(), offer.collateral_mint);
        let borrower = collateral_in.owner();
        offer.assert_borrower(&borrower)?;

        // 5. Create the principal output to the borrower and the loan UTXO.
        let mut principal_out = TokenUtxos::new_init(&borrower, &offer.asset());
        let mut loan = DataUtxo::<LoanTerms>::new_init(public.loan_owner.owner())
            .with_asset(&collateral_in.asset())?;

        // The closed collateral input must end at zero, so it holds exactly
        // the collateral amount; the offer pays its whole principal out.
        let collateral_amount = offer.collateral_amount;
        let principal_mint = offer.asset();
        let repay_amount = offer.repay_amount;
        let lender = offer.lender;
        let deadline = offer.deadline;
        offer.transfer_all(&mut principal_out)?;
        collateral_in.transfer(&mut loan, &collateral_amount)?;

        // 6. Set the loan terms from the offer and the borrower.
        loan.principal_mint = principal_mint;
        loan.repay_amount = repay_amount;
        loan.lender = lender;
        loan.borrower = borrower;
        loan.deadline = deadline;

        // 7. Check the transaction.
        let checked = ConfidentialTransaction::new(&private.tx_context, public)
            .with(offer)
            .with(collateral_in)
            .with(principal_out)
            .with(loan)
            .check()?;

        // 8. Check the published first nullifier.
        require_eq(checked.first_nullifier, public.first_nullifier);
        Ok(checked)
    }
}
