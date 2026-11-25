use spr_program::{
    circuit::{
        CheckedTransaction, ConfidentialTransaction, DataUtxo, PublicInputs, TokenUtxos, Utxo,
        UtxoTrait,
    },
    input, require, require_eq, Asset, CircuitError, ClientInputs, Field, ShieldedAddress,
    TxContext, ZkProgram,
};

use super::OfferTerms;

#[input]
#[derive(ZkProgram)]
pub struct Offer {
    pub private: OfferPrivateInputs,
    pub public: OfferPublicInputs,
}

#[input]
#[derive(ClientInputs)]
pub struct OfferPrivateInputs {
    pub tx_context: TxContext,
    /// The lender's spent source UTXO (the principal's mint). SPP authorizes
    /// the spend with the lender's signature; its owner becomes the offer's
    /// lender and receives the change.
    pub source: Utxo,
    /// The principal: the amount locked in the offer UTXO.
    pub principal_amount: u64,
    /// The offer terms other than the lender; see [`OfferTerms`].
    pub collateral_mint: Asset,
    pub collateral_amount: u64,
    pub repay_amount: u64,
    pub deadline: u64,
    pub expiry: u64,
    pub borrower_pk_fe: [u8; 32],
}

#[input]
#[derive(PublicInputs)]
pub struct OfferPublicInputs {
    /// `hash_bytes` of the lender signer's tagged pubkey, which the program
    /// computes from the signer account.
    pub lender_owner_pk_field: Field,
    /// The offer UTXO's address: the lender's loan-authority PDA with the
    /// borrower's viewing key, so the borrower can decrypt the offer. The
    /// program derives the PDA from the lender signer and hashes the
    /// address. SPP accepts a data-bearing output owned by any owner signer,
    /// the lender included, so this binds the offer UTXO to the PDA that
    /// only the program signs for.
    pub offer_owner: ShieldedAddress,
}

impl Offer {
    /// 1. Spend the source UTXO and check its owner is the lender signer.
    /// 2. Create the offer UTXO, owned by the public `offer_owner`, and lock
    ///    the principal in it; the rest of the source returns to its owner
    ///    as change.
    /// 3. Set and check the offer terms; the source owner is the lender.
    /// 4. Check the transaction: outputs `[change, offer UTXO]`.
    pub fn execute(&self) -> Result<CheckedTransaction, CircuitError> {
        let private = &self.private;

        // 1. Spend the source UTXO of the lender signer.
        let mut tokens = TokenUtxos::new_mut(core::array::from_ref(&private.source))?;
        let lender = tokens.owner();
        require_eq(lender.key().identity()?, self.public.lender_owner_pk_field);

        // 2. Lock the principal in the offer UTXO.
        require(private.principal_amount != 0);
        let mut offer = DataUtxo::<OfferTerms>::new_init(self.public.offer_owner.owner())
            .with_asset(&tokens.asset())?;
        tokens.transfer(&mut offer, &private.principal_amount)?;

        // 3. Set and check the offer terms.
        offer.collateral_mint = private.collateral_mint;
        offer.collateral_amount = private.collateral_amount;
        offer.repay_amount = private.repay_amount;
        offer.deadline = private.deadline;
        offer.lender = lender;
        offer.expiry = private.expiry;
        offer.borrower_pk_fe = private.borrower_pk_fe;
        offer.assert_valid();

        // 4. Check the transaction: outputs `[change, offer UTXO]`.
        ConfidentialTransaction::new(&private.tx_context, &self.public)
            .with(tokens)
            .with(offer)
            .check()
    }
}
