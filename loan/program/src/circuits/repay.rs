use spr_program::{
    circuit::{
        CheckedTransaction, ConfidentialTransaction, PublicInputs, TokenUtxos, Utxo, UtxoTrait,
    },
    input, require_eq, CircuitError, ClientInputs, Field, ShieldedAddress, TxContext, ZkProgram,
};

use super::{
    shared::{assert_blinding_seed, spend_loan},
    LoanTerms,
};

#[input]
#[derive(ZkProgram)]
pub struct Repay {
    pub private: RepayPrivateInputs,
    pub public: RepayPublicInputs,
}

#[input]
#[derive(ClientInputs)]
pub struct RepayPrivateInputs {
    pub tx_context: TxContext,
    pub terms: LoanTerms,
    /// The loan UTXO, which commits `terms` and holds the collateral.
    pub loan_utxo: Utxo,
    /// The borrower's repayment input. It must hold exactly the loan's
    /// `repay_amount` of `principal_mint` and be owned by the loan's
    /// borrower.
    pub repay_in: Utxo,
    /// The lender's shielded address, whose viewing key the repayment is
    /// encrypted to. The circuit does not read it: the repayment owner is
    /// the committed `terms.lender`.
    pub lender_address: ShieldedAddress,
}

#[input]
#[derive(PublicInputs)]
pub struct RepayPublicInputs {
    /// The committed loan `deadline`; the program checks `now <= deadline`.
    pub deadline: u64,
    /// The first SPP input's nullifier, which the program reads from the
    /// transact.
    pub first_nullifier: Field,
}

impl Repay {
    /// 1. Check the blinding seed derives from the loan opening.
    /// 2. Spend the loan UTXO, which commits the terms.
    /// 3. Reveal the deadline: the program checks `now <= deadline`.
    /// 4. Spend the repayment input: the principal mint, owned by the
    ///    borrower.
    /// 5. Pay the whole collateral back to the borrower and exactly
    ///    `repay_amount` to the lender.
    /// 6. Check the transaction: inputs `[loan UTXO, repayment input]`,
    ///    outputs `[collateral to borrower, repayment to lender]`.
    /// 7. Check the first nullifier the output blindings derive from is the
    ///    published one.
    pub fn execute(&self) -> Result<CheckedTransaction, CircuitError> {
        let private = &self.private;
        let public = &self.public;

        // 1. The borrower holds the loan opening from building the originate
        // transaction; with the published first nullifier, the lender
        // recovers its repayment without the borrower's ciphertext.
        assert_blinding_seed(
            &private.tx_context,
            crate::REPAY_BLINDING_DOMAIN,
            &private.loan_utxo.blinding,
        )?;

        // 2. Spend the loan UTXO, which commits the terms.
        let mut loan = spend_loan(&private.loan_utxo, &private.terms)?;

        // 3. Reveal the deadline as a public input.
        require_eq(public.deadline, loan.deadline);

        // 4. Spend the repayment input: the principal mint, the borrower.
        let mut repay_in = TokenUtxos::new_mut(core::array::from_ref(&private.repay_in))?.close();
        require_eq(repay_in.asset(), loan.principal_mint);
        require_eq(repay_in.owner().hash()?, loan.borrower.hash()?);

        // 5. Create the collateral and repayment outputs. The closed
        // repayment input must end at zero, so it holds exactly
        // `repay_amount`; the loan pays its whole collateral back.
        let mut collateral_out = TokenUtxos::new_init(&loan.borrower, &loan.asset());
        let mut repayment_out = TokenUtxos::new_init(&loan.lender, &loan.principal_mint);
        let repay_amount = loan.repay_amount;
        loan.transfer_all(&mut collateral_out)?;
        repay_in.transfer(&mut repayment_out, &repay_amount)?;

        // 6. Check the transaction.
        let checked = ConfidentialTransaction::new(&private.tx_context, public)
            .with(loan)
            .with(repay_in)
            .with(collateral_out)
            .with(repayment_out)
            .check()?;

        // 7. Check the published first nullifier.
        require_eq(checked.first_nullifier, public.first_nullifier);
        Ok(checked)
    }
}
