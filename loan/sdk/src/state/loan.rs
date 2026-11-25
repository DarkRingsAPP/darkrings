use anyhow::{ensure, Result};
use loan_program::circuits::{self, LoanTermsClient};
use spr_keypair::{ShieldedAddress, X25519Pubkey};
use spr_program::{
    circuit::DataHash, ClientInputs, DataUtxo, EncryptionCodec, InputRecords, ProgramOwner,
    UtxoOwner,
};
use spr_transaction::{AssetRegistry, Mint, SppProofOutputUtxo, WalletUtxo};

use crate::{err, loan_authority, state::offer::resolve_mint};

/// The loan terms: what the borrower repays, to whom, until when. The
/// borrower is kept as its raw UTXO owner, which the state commits: the
/// lender decodes a loan without knowing the borrower's full shielded
/// address.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LoanTerms {
    /// The repayment's mint: the principal the borrower received.
    pub principal_mint: Mint,
    pub repay_amount: u64,
    /// The lender's shielded address: receives the repayment at repay and
    /// the collateral at claim; its Solana key signs the claim. The loan
    /// UTXO commits its owner; the viewing key only encrypts the loan data.
    pub lender: ShieldedAddress,
    /// The borrower's UTXO owner: receives the collateral back at repay.
    pub borrower: UtxoOwner,
    /// Unix seconds; repay requires `now <= deadline`, claim `now > deadline`.
    pub deadline: u64,
}

impl LoanTerms {
    /// The terms as the circuits take them.
    pub fn circuit_terms(&self) -> Result<LoanTermsClient> {
        Ok(LoanTermsClient {
            principal_mint: self.principal_mint,
            repay_amount: self.repay_amount,
            lender: *InputRecords::new()
                .address(&self.lender)
                .map_err(err)?
                .owner(),
            borrower: self.borrower,
            deadline: self.deadline,
        })
    }

    /// The lender's loan-authority PDA, the owner of the loan UTXO.
    pub fn loan_authority(&self) -> Result<ProgramOwner> {
        Ok(loan_authority(&self.lender.solana_address().map_err(err)?))
    }

    /// The loan UTXO's state, which the SDK hashes and encodes.
    pub fn state(&self) -> Result<circuits::LoanTerms> {
        circuits::LoanTerms::from_client(self.circuit_terms()?, &mut InputRecords::new())
            .map_err(err)
    }

    /// The terms of a decoded loan UTXO state whose lender is `lender`, with
    /// the principal mint's asset id resolved in `registry`.
    pub fn from_state(
        state: &circuits::LoanTerms,
        lender: ShieldedAddress,
        registry: &AssetRegistry,
    ) -> Result<Self> {
        let terms = Self {
            principal_mint: resolve_mint(registry, &state.principal_mint)?,
            repay_amount: state.repay_amount,
            lender,
            borrower: state.borrower,
            deadline: state.deadline,
        };
        ensure!(terms.state()? == *state, "the loan names another lender");
        Ok(terms)
    }

    /// The loan UTXO's encrypted `utxo_data`, the state's Borsh encoding,
    /// and its data hash, `Poseidon(DATA, state hash)`, from one state.
    pub(crate) fn utxo_data(&self) -> Result<(Vec<u8>, [u8; 32])> {
        let state = self.state()?;
        let terms_hash = DataHash::hash(&state).map_err(err)?;
        let data_hash =
            spr_program::hasher::data_hash(&spr_program::to_bytes(&terms_hash)).map_err(err)?;
        Ok((state.serialize_for_encryption().map_err(err)?, data_hash))
    }
}

/// The loan UTXO: `collateral_amount` of `collateral_mint` owned by the
/// lender's loan-authority PDA under the zero nullifier key, with the terms
/// as its state. Its opening (terms and blinding) plus the program's PDA
/// signature is the complete spend capability; the program signs only
/// through `repay` (before the deadline, by the borrower) and `claim`
/// (after it, by the lender).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LoanUtxo {
    pub terms: LoanTerms,
    /// Derived by the originate transaction from its first nullifier,
    /// blinding seed and output slot.
    pub blinding: [u8; 32],
    pub collateral_mint: Mint,
    pub collateral_amount: u64,
}

impl LoanUtxo {
    /// The loan of a decoded loan UTXO whose lender is `lender`. The SDK's
    /// decode ([`DataUtxo::try_from`]) has checked the state against the
    /// UTXO's commitment.
    pub fn from_data_utxo(
        loan: DataUtxo<circuits::LoanTerms>,
        lender: ShieldedAddress,
        registry: &AssetRegistry,
    ) -> Result<Self> {
        Ok(Self {
            terms: LoanTerms::from_state(&loan.data, lender, registry)?,
            blinding: loan.utxo.utxo.blinding,
            collateral_mint: loan.utxo.utxo.asset,
            collateral_amount: loan.utxo.utxo.amount,
        })
    }

    /// The loan output. The owner's viewing key does not enter the
    /// commitment; originate encrypts the output to the lender's.
    pub fn output_utxo(&self, viewing_pubkey: X25519Pubkey) -> Result<SppProofOutputUtxo> {
        let (payload, data_hash) = self.terms.utxo_data()?;
        Ok(SppProofOutputUtxo {
            asset: self.collateral_mint,
            amount: self.collateral_amount,
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

    /// The loan UTXO's commitment in tree `tree_id`.
    pub fn hash(&self, tree_id: u16) -> Result<[u8; 32]> {
        self.output_utxo(self.terms.lender.viewing_pubkey)?
            .hash(tree_id)
            .map_err(err)
    }

    /// The loan UTXO as an SPP input at `leaf_index` of tree `tree_id`.
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

    /// The lender's repayment payout of the repay whose first nullifier is
    /// `first_nullifier`, from the loan opening alone: the repay circuit
    /// fixes its blinding seed to
    /// [`crate::instructions::repay::repay_blinding_seed`], and the payout
    /// is output slot 1. No settlement ciphertext is needed.
    pub fn derived_repayment_output(
        &self,
        first_nullifier: &[u8; 32],
    ) -> Result<SppProofOutputUtxo> {
        let blinding_seed = crate::instructions::repay::repay_blinding_seed(&self.blinding)?;
        let seed = spr_program::derive_output_blinding_seed(first_nullifier, &blinding_seed)
            .map_err(err)?;
        let blinding =
            spr_program::derive_transact_output_blinding(first_nullifier, &seed, 1).map_err(err)?;
        Ok(SppProofOutputUtxo {
            asset: self.terms.principal_mint,
            amount: self.terms.repay_amount,
            blinding,
            owner_address: Some(self.terms.lender),
            ..Default::default()
        })
    }
}
