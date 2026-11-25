use anyhow::{ensure, Result};
use spr_hasher::primitives::is_canonical_bn254_scalar_be;
use spr_keypair::{ShieldedAddress, X25519Pubkey};
use spr_program::{
    circuit::DataHash, ClientInputs, DataUtxo, EncryptionCodec, InputRecords, ProgramOwner,
};
use spr_transaction::{AssetRegistry, Mint, SppProofOutputUtxo, WalletUtxo};
use loan_program::circuits::{self, OfferTermsClient};

use crate::{err, loan_authority};

/// The order terms: what the lender buys, where the payout goes, until when the
/// order can be taken and by whom.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OfferTerms {
    pub collateral_mint: Mint,
    pub collateral_amount: u64,
    /// What the borrower repays, in the principal's mint, to reclaim the
    /// collateral before `deadline`.
    pub repay_amount: u64,
    /// Unix seconds; the absolute repay-by time of the loan once originated.
    pub deadline: u64,
    /// The lender's shielded address: receives the destination on take and the
    /// source on cancel; its Solana key signs the cancel. The order UTXO
    /// commits its owner; the viewing key only encrypts the lender payout.
    pub lender: ShieldedAddress,
    /// Unix seconds.
    pub expiry: u64,
    /// The designated borrower's owner identity ([`crate::shared::identity`] of
    /// its Solana address), or `None` for an order anyone holding the opening
    /// may take. It must be a canonical field element
    /// ([`check_borrower_pk_fe`]); every builder refuses another.
    pub borrower: Option<[u8; 32]>,
}

/// Checks `borrower_pk_fe` is a canonical BN254 scalar field element, below the
/// modulus. The circuit packs its 32 big-endian bytes into one field element,
/// so a value at or above the modulus wraps to another borrower than the one the
/// bytes name, and the SDK and the circuit would disagree on who may take.
/// Zero (an open order) and every `solana_owner_identity` are canonical.
pub fn check_borrower_pk_fe(borrower_pk_fe: &[u8; 32]) -> Result<()> {
    ensure!(
        is_canonical_bn254_scalar_be(borrower_pk_fe),
        "borrower_pk_fe is not a canonical field element"
    );
    Ok(())
}

impl OfferTerms {
    /// The terms as the circuits take them. Fails if the borrower is not a
    /// canonical field element.
    pub fn circuit_terms(&self) -> Result<OfferTermsClient> {
        let borrower_pk_fe = self.borrower.unwrap_or_default();
        check_borrower_pk_fe(&borrower_pk_fe)?;
        Ok(OfferTermsClient {
            collateral_mint: self.collateral_mint,
            collateral_amount: self.collateral_amount,
            repay_amount: self.repay_amount,
            deadline: self.deadline,
            lender: *InputRecords::new()
                .address(&self.lender)
                .map_err(err)?
                .owner(),
            expiry: self.expiry,
            borrower_pk_fe,
        })
    }

    /// The lender's order-authority PDA, the owner of the order UTXO.
    pub fn loan_authority(&self) -> Result<ProgramOwner> {
        Ok(loan_authority(&self.lender.solana_address().map_err(err)?))
    }

    /// The order UTXO's state, which the SDK hashes and encodes.
    pub fn state(&self) -> Result<circuits::OfferTerms> {
        circuits::OfferTerms::from_client(self.circuit_terms()?, &mut InputRecords::new())
            .map_err(err)
    }

    /// The terms of a decoded order UTXO state whose lender is `lender`, with
    /// the destination mint's asset id resolved in `registry`. Fails if the
    /// state's `borrower_pk_fe` is not a canonical field element.
    pub fn from_state(
        state: &circuits::OfferTerms,
        lender: ShieldedAddress,
        registry: &AssetRegistry,
    ) -> Result<Self> {
        check_borrower_pk_fe(&state.borrower_pk_fe)?;
        let terms = Self {
            collateral_mint: resolve_mint(registry, &state.collateral_mint)?,
            collateral_amount: state.collateral_amount,
            repay_amount: state.repay_amount,
            deadline: state.deadline,
            lender,
            expiry: state.expiry,
            borrower: Some(state.borrower_pk_fe).filter(|id| *id != [0; 32]),
        };
        ensure!(terms.state()? == *state, "the order names another lender");
        Ok(terms)
    }

    /// The order UTXO's encrypted `utxo_data`, the state's Borsh encoding,
    /// and its data hash, `Poseidon(DATA, state hash)`, from one state.
    fn utxo_data(&self) -> Result<(Vec<u8>, [u8; 32])> {
        let state = self.state()?;
        let terms_hash = DataHash::hash(&state).map_err(err)?;
        let data_hash =
            spr_program::hasher::data_hash(&spr_program::to_bytes(&terms_hash)).map_err(err)?;
        Ok((state.serialize_for_encryption().map_err(err)?, data_hash))
    }
}

/// The mint of a 32-byte asset: all zeros is SOL, any other is looked up in
/// `registry`.
pub(crate) fn resolve_mint(registry: &AssetRegistry, asset: &[u8; 32]) -> Result<Mint> {
    if asset == Mint::SOL.asset.as_array() {
        return Ok(Mint::SOL);
    }
    registry
        .mint(&solana_address::Address::new_from_array(*asset))
        .map_err(err)
}

/// The order UTXO: `principal_amount` of `principal_mint` owned by the lender's
/// order-authority PDA under the zero nullifier key, with the terms as its
/// state. Its opening (terms and blinding) is the complete spend capability;
/// the program signs for the PDA only through `take` and `cancel`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OfferUtxo {
    pub terms: OfferTerms,
    /// Derived by the make transaction from its first nullifier, blinding
    /// seed and output slot.
    pub blinding: [u8; 32],
    pub principal_mint: Mint,
    pub principal_amount: u64,
}

impl OfferUtxo {
    /// The order of a decoded order UTXO whose lender is `lender`. The SDK's
    /// decode ([`DataUtxo::try_from`]) has checked the state against the
    /// UTXO's commitment.
    pub fn from_data_utxo(
        order: DataUtxo<circuits::OfferTerms>,
        lender: ShieldedAddress,
        registry: &AssetRegistry,
    ) -> Result<Self> {
        Ok(Self {
            terms: OfferTerms::from_state(&order.data, lender, registry)?,
            blinding: order.utxo.utxo.blinding,
            principal_mint: order.utxo.utxo.asset,
            principal_amount: order.utxo.utxo.amount,
        })
    }

    /// The order output. The owner's viewing key does not enter the
    /// commitment; make encrypts the output to the borrower's.
    pub fn output_utxo(&self, viewing_pubkey: X25519Pubkey) -> Result<SppProofOutputUtxo> {
        let (payload, data_hash) = self.terms.utxo_data()?;
        Ok(SppProofOutputUtxo {
            asset: self.principal_mint,
            amount: self.principal_amount,
            blinding: self.blinding,
            owner_address: Some(
                self.terms
                    .loan_authority()?
                    .address(viewing_pubkey)
                    .map_err(err)?,
            ),
            ..Default::default()
        }
        .with_utxo_data(payload, data_hash))
    }

    /// The order UTXO's commitment in tree `tree_id`.
    pub fn hash(&self, tree_id: u16) -> Result<[u8; 32]> {
        self.output_utxo(self.terms.lender.viewing_pubkey)?
            .hash(tree_id)
            .map_err(err)
    }

    /// The order UTXO as an SPP input at `leaf_index` of tree `tree_id`.
    /// Anyone holding the opening can build it; spending needs the PDA
    /// signature only the program gives.
    pub fn to_input_utxo(&self, tree_id: u16, leaf_index: u64) -> Result<WalletUtxo> {
        self.terms
            .loan_authority()?
            .input(
                &self.output_utxo(self.terms.lender.viewing_pubkey)?,
                tree_id,
                leaf_index,
            )
            .map_err(err)
    }

    /// An originate output blinding derived from the offer opening alone:
    /// the originate circuit fixes its blinding seed to
    /// [`crate::instructions::originate::originate_blinding_seed`], so both
    /// parties derive every output blinding from the first nullifier. Slot 0
    /// is the principal to the borrower, slot 1 the loan UTXO.
    pub fn derived_originate_blinding(
        &self,
        first_nullifier: &[u8; 32],
        slot: u32,
    ) -> Result<[u8; 32]> {
        let blinding_seed =
            crate::instructions::originate::originate_blinding_seed(&self.blinding)?;
        let seed = spr_program::derive_output_blinding_seed(first_nullifier, &blinding_seed)
            .map_err(err)?;
        spr_program::derive_transact_output_blinding(first_nullifier, &seed, slot).map_err(err)
    }

    /// The borrower's principal payout of the originate whose first
    /// nullifier is `first_nullifier`, from the offer opening alone: output
    /// slot 0. No settlement ciphertext is needed.
    pub fn derived_principal_output(
        &self,
        first_nullifier: &[u8; 32],
        borrower: ShieldedAddress,
    ) -> Result<SppProofOutputUtxo> {
        Ok(SppProofOutputUtxo {
            asset: self.principal_mint,
            amount: self.principal_amount,
            blinding: self.derived_originate_blinding(first_nullifier, 0)?,
            owner_address: Some(borrower),
            ..Default::default()
        })
    }
}

#[cfg(test)]
mod tests {
    use solana_address::Address;
    use solana_keypair::Keypair;
    use spr_keypair::ShieldedKeypair;

    use super::*;

    fn terms(borrower: Option<[u8; 32]>) -> OfferTerms {
        let lender = ShieldedKeypair::from_keypair(&Keypair::new_from_array([21u8; 32]))
            .unwrap()
            .shielded_address()
            .unwrap();
        OfferTerms {
            collateral_mint: Mint::new(Address::new_from_array([4; 32]), 2),
            collateral_amount: 250_000,
            repay_amount: 420_000,
            deadline: 1_700_600_000,
            lender,
            expiry: 1_700_000_000,
            borrower,
        }
    }

    fn registry() -> AssetRegistry {
        let mut registry = AssetRegistry::default();
        registry
            .insert(2, Address::new_from_array([4; 32]))
            .unwrap();
        registry
    }

    fn order(terms: OfferTerms) -> OfferUtxo {
        OfferUtxo {
            terms,
            blinding: crate::shared::test_blinding(7),
            principal_mint: Mint::SOL,
            principal_amount: 400_000,
        }
    }

    #[test]
    fn offer_utxo_decodes_designated_and_open_terms() {
        // 1. Decode the order UTXO of a designated and an open order.
        for terms in [
            terms(Some([0, 5, 6, 7].repeat(8).try_into().unwrap())),
            terms(None),
        ] {
            let order = order(terms);
            let input = order.to_input_utxo(0, 3).unwrap();
            // 2. The decoded order equals the encoded one.
            assert_eq!(
                OfferUtxo::from_data_utxo(
                    DataUtxo::try_from(input).unwrap(),
                    order.terms.lender,
                    &registry()
                )
                .unwrap(),
                order
            );
        }
    }

    #[test]
    fn offer_utxo_with_another_payload_is_refused() {
        let order = order(terms(None));
        let mut input = order.to_input_utxo(0, 3).unwrap();
        let mut other = order.terms.clone();
        other.repay_amount += 1;
        input.utxo.data = SppProofOutputUtxo::default()
            .with_utxo_data(other.utxo_data().unwrap().0, [0; 32])
            .data;
        assert!(DataUtxo::<circuits::OfferTerms>::try_from(input).is_err());
    }

    /// The BN254 scalar modulus, big-endian.
    const MODULUS: [u8; 32] = spr_hasher::primitives::BN254_SCALAR_MODULUS_BE;

    /// The modulus plus one: its last byte is 0x01, so adding one does not
    /// carry.
    fn modulus_plus_one() -> [u8; 32] {
        let mut bytes = MODULUS;
        if let Some(last) = bytes.last_mut() {
            *last += 1;
        }
        bytes
    }

    /// A real borrower identity, `solana_owner_identity` of a Solana address.
    fn real_identity() -> [u8; 32] {
        crate::shared::identity(&Address::new_from_array([13u8; 32])).unwrap()
    }

    #[test]
    fn borrower_pk_fe_must_be_canonical() {
        for borrower_pk_fe in [MODULUS, modulus_plus_one(), [0xff; 32]] {
            assert!(check_borrower_pk_fe(&borrower_pk_fe).is_err());
            // Building the terms refuses it.
            assert!(terms(Some(borrower_pk_fe)).circuit_terms().is_err());
            assert!(terms(Some(borrower_pk_fe)).state().is_err());
        }
        for borrower_pk_fe in [[0; 32], real_identity()] {
            assert!(check_borrower_pk_fe(&borrower_pk_fe).is_ok());
            assert_eq!(
                terms(Some(borrower_pk_fe))
                    .circuit_terms()
                    .unwrap()
                    .borrower_pk_fe,
                borrower_pk_fe
            );
        }
    }

    /// A decoded state whose `borrower_pk_fe` is the modulus, or the modulus
    /// plus one, is refused; zero and a real identity decode.
    #[test]
    fn decoded_state_with_non_canonical_taker_is_refused() {
        let terms = terms(None);
        let state = terms.state().unwrap();
        for borrower_pk_fe in [MODULUS, modulus_plus_one()] {
            let state = circuits::OfferTerms {
                borrower_pk_fe,
                ..state
            };
            assert!(OfferTerms::from_state(&state, terms.lender, &registry()).is_err());
        }
        for borrower in [None, Some(real_identity())] {
            let terms = OfferTerms {
                borrower,
                ..terms.clone()
            };
            let state = terms.state().unwrap();
            assert_eq!(
                OfferTerms::from_state(&state, terms.lender, &registry()).unwrap(),
                terms
            );
        }
    }

    #[test]
    fn order_of_another_maker_is_refused() {
        let order = order(terms(None));
        let decoded = DataUtxo::try_from(order.to_input_utxo(0, 3).unwrap()).unwrap();
        let other = ShieldedKeypair::from_keypair(&Keypair::new_from_array([22u8; 32]))
            .unwrap()
            .shielded_address()
            .unwrap();
        assert!(OfferUtxo::from_data_utxo(decoded, other, &registry()).is_err());
    }
}
