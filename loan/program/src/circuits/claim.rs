use spr_program::{
    circuit::{
        CheckedTransaction, ConfidentialTransaction, PublicInputs, TokenUtxos, UtxoTrait, Utxo,
    },
    input, require_eq, CircuitError, ClientInputs, Field, TxContext, ZkProgram,
};

use super::{shared::spend_loan, LoanTerms};

#[input]
#[derive(ZkProgram)]
pub struct Claim {
    pub private: ClaimPrivateInputs,
    pub public: ClaimPublicInputs,
}

#[input]
#[derive(ClientInputs)]
pub struct ClaimPrivateInputs {
    pub tx_context: TxContext,
    /// The loan UTXO. The circuit does not constrain its owner: SPP spends
    /// it only with the loan-authority PDA's signature.
    pub loan_utxo: Utxo,
    /// The loan UTXO's state.
    pub terms: LoanTerms,
}

#[input]
#[derive(PublicInputs)]
pub struct ClaimPublicInputs {
    /// The committed loan `deadline`; the program checks `now > deadline`.
    pub deadline: u64,
    /// `hash_bytes` of the lender signer's tagged pubkey, which the program
    /// computes from the signer account.
    pub lender_owner_pk_field: Field,
}

impl Claim {
    /// 1. Spend the loan UTXO with its terms.
    /// 2. Check the signer is the lender and reveal the deadline; the
    ///    program checks `now > deadline`, so a defaulted loan's collateral
    ///    goes to the lender.
    /// 3. Pay the whole collateral to the lender.
    /// 4. Check the transaction: outputs `[collateral to lender]`.
    pub fn execute(&self) -> Result<CheckedTransaction, CircuitError> {
        let private = &self.private;
        let public = &self.public;

        // 1. Spend the loan UTXO with its terms.
        let mut loan = spend_loan(&private.loan_utxo, &private.terms)?;

        // 2. Check the signer is the lender and reveal the deadline.
        require_eq(loan.lender.key().identity()?, public.lender_owner_pk_field);
        require_eq(public.deadline, loan.deadline);

        // 3. Pay the whole collateral to the lender.
        let mut collateral_out = TokenUtxos::new_init(&loan.lender, &loan.asset());
        loan.transfer_all(&mut collateral_out)?;

        // 4. Check the transaction: outputs `[collateral to lender]`.
        ConfidentialTransaction::new(&private.tx_context, public)
            .with(loan)
            .with(collateral_out)
            .check()
    }
}
