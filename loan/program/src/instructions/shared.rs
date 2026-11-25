use light_program_profiler::profile;
use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    AccountView, Address, ProgramResult,
};
use spr_hasher::primitives::solana_owner_identity;
use spr_interface::instruction::instruction_data::transact::TransactIxDataRef;
use spr_program::{
    cpi::{SppTransactAccounts, TransactAccountsError},
    program::PdaOwner,
    verifier::address_hash,
};
use wincode::{config::DefaultConfig, SchemaReadOwned};

use crate::{error::LoanError, verifier::offer};

/// Instruction data: the instruction's own `args`, then the SPP `transact`
/// data. The program reads the transact fields it checks in place and
/// forwards `transact_bytes` to SPP unchanged.
pub struct IxData<'a, A> {
    pub args: A,
    pub transact: TransactIxDataRef<'a>,
    pub transact_bytes: &'a [u8],
}

impl<'a, A: SchemaReadOwned<DefaultConfig, Dst = A>> IxData<'a, A> {
    pub fn parse(data: &'a [u8]) -> Result<Self, ProgramError> {
        let mut transact_bytes = data;
        let args = wincode::deserialize_from(&mut transact_bytes)
            .map_err(|_| LoanError::InvalidInstructionData)?;
        let transact = TransactIxDataRef::from_bytes(transact_bytes)
            .map_err(|_| LoanError::InvalidInstructionData)?;
        Ok(Self {
            args,
            transact,
            transact_bytes,
        })
    }
}

#[inline(always)]
pub fn check_within_window(now: i64, expiry_unix_ts: u64) -> ProgramResult {
    if now >= 0 && (now as u64) <= expiry_unix_ts {
        Ok(())
    } else {
        Err(LoanError::Expired.into())
    }
}

#[inline(always)]
pub fn check_after_window(now: i64, expiry_unix_ts: u64) -> ProgramResult {
    if now >= 0 && (now as u64) > expiry_unix_ts {
        Ok(())
    } else {
        Err(LoanError::NotYetExpired.into())
    }
}

/// A maker's order-authority PDA, `[LOAN_AUTHORITY_PDA_SEED, maker, [bump]]`: the
/// owner of the maker's order UTXOs under nullifier secret 0. Only the program
/// signs for it, so only take and cancel spend an order UTXO.
pub struct LoanAuthority {
    address: Address,
    lender: [u8; 32],
    bump: u8,
}

impl LoanAuthority {
    /// The PDA `[LOAN_AUTHORITY_PDA_SEED, maker, [bump]]`, with the bump the
    /// client passes in the instruction data instead of a
    /// `find_program_address` search, so the derivation costs one
    /// `create_program_address` for every maker. A bump that derives no
    /// program address fails.
    ///
    /// The SDK passes the canonical bump. A non-canonical bump that still
    /// derives a program address names another PDA of the same maker: make
    /// then outputs the order UTXO to that PDA, which only that bump spends,
    /// and take and cancel sign for a PDA that owns none of the maker's
    /// canonical orders. Either way it moves only the maker's own UTXO; it
    /// signs for no other maker's PDA.
    pub fn new(lender: &[u8; 32], bump: u8) -> Result<Self, LoanError> {
        let [seed, lender_seed] = crate::loan_authority_seeds(lender);
        let address = Address::create_program_address(&[seed, lender_seed, &[bump]], &crate::ID)
            .map_err(|_| LoanError::InvalidLoanAuthorityBump)?;
        Ok(Self {
            address,
            lender: *lender,
            bump,
        })
    }

    /// `Poseidon(solana_owner_identity(pda), Poseidon(0))`.
    fn owner_hash(&self) -> Result<[u8; 32], LoanError> {
        Ok(*PdaOwner::new(&self.address)
            .map_err(|_| LoanError::HashingFailed)?
            .owner_hash())
    }

    /// The offer proof's public inputs: the lender's owner identity, and
    /// this PDA's address with the borrower's `viewing_pubkey` as the offer
    /// UTXO's owner.
    pub fn offer_public_inputs(
        &self,
        viewing_pubkey: &[u8; 33],
    ) -> Result<offer::PublicInputs, LoanError> {
        Ok(offer::PublicInputs {
            lender_owner_pk_field: solana_owner_identity(&self.lender)?,
            offer_owner: address_hash(&self.owner_hash()?, viewing_pubkey)?,
        })
    }

    /// This PDA's address hash with `viewing_pubkey`: the loan UTXO's owner
    /// the originate proof binds (the lender's PDA with the lender's viewing
    /// key).
    pub fn address_hash_with(&self, viewing_pubkey: &[u8; 33]) -> Result<[u8; 32], LoanError> {
        Ok(address_hash(&self.owner_hash()?, viewing_pubkey)?)
    }

    /// Invokes SPP `transact` with `spp_accounts`, signed by this PDA, which
    /// must be among them.
    #[inline(never)]
    #[profile]
    pub fn cpi_spp_transact_signed(
        &self,
        spp_accounts: &[AccountView],
        transact: &[u8],
    ) -> ProgramResult {
        let signer_pdas = [&self.address];
        let spp = SppTransactAccounts::new(spp_accounts, &signer_pdas)
            .map_err(transact_accounts_error)?;
        let bump = [self.bump];
        let seeds = [
            Seed::from(crate::LOAN_AUTHORITY_PDA_SEED),
            Seed::from(&self.lender),
            Seed::from(&bump),
        ];
        spp.invoke::<16>(transact, &[Signer::from(&seeds)])
    }
}

fn transact_accounts_error(error: TransactAccountsError) -> ProgramError {
    match error {
        TransactAccountsError::InvalidSppProgram => LoanError::InvalidShieldedPoolProgram.into(),
        TransactAccountsError::MissingPdaSigner { .. } => LoanError::MissingLoanAuthority.into(),
        TransactAccountsError::NotEnoughAccounts => ProgramError::NotEnoughAccountKeys,
    }
}
