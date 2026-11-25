use spr_program::{
    circuit::{
        CheckedTransaction, ConfidentialTransaction, PublicInputs, TokenUtxos, Utxo, UtxoTrait,
    },
    input, require_eq, CircuitError, ClientInputs, Field, TxContext, ZkProgram,
};

use super::{shared::spend_offer, OfferTerms};

#[input]
#[derive(ZkProgram)]
pub struct Cancel {
    pub private: CancelPrivateInputs,
    pub public: CancelPublicInputs,
}

#[input]
#[derive(ClientInputs)]
pub struct CancelPrivateInputs {
    pub tx_context: TxContext,
    pub terms: OfferTerms,
    /// The offer UTXO, which commits `terms`.
    pub offer_utxo: Utxo,
}

#[input]
#[derive(PublicInputs)]
pub struct CancelPublicInputs {
    /// The instruction's `offer_expiry`; the program checks `now > expiry`.
    pub expiry: u64,
    /// `hash_bytes` of the lender signer's tagged pubkey, which the program
    /// computes from the signer account.
    pub lender_owner_pk_field: Field,
}

impl Cancel {
    /// 1. Spend the offer UTXO, which commits the terms.
    /// 2. Check the public expiry.
    /// 3. Check the signer is the lender.
    /// 4. Refund the whole principal to the lender.
    /// 5. Check the transaction: input `[offer UTXO]`, output `[source]`.
    pub fn execute(&self) -> Result<CheckedTransaction, CircuitError> {
        let private = &self.private;
        let public = &self.public;

        // 1. Spend the offer UTXO, which commits the terms.
        let mut offer = spend_offer(&private.offer_utxo, &private.terms)?;

        // 2. Check the public expiry.
        require_eq(public.expiry, offer.expiry);

        // 3. The terms commit the lender's owner, whose signing key identity
        // the program computes from the signer.
        let lender = offer.lender;
        require_eq(lender.key().identity()?, public.lender_owner_pk_field);

        // 4. Refund the whole principal to the lender.
        let mut source_output = TokenUtxos::new_init(&lender, &offer.asset());
        offer.transfer_all(&mut source_output)?;

        // 5. Check the transaction.
        ConfidentialTransaction::new(&private.tx_context, public)
            .with(offer)
            .with(source_output)
            .check()
    }
}
