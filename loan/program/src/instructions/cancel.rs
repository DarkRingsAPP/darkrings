use light_program_profiler::profile;
use pinocchio::{
    sysvars::{clock::Clock, Sysvar},
    AccountView, ProgramResult,
};
use spr_account_checks::AccountIterator;
use spr_hasher::primitives::solana_owner_identity;
use spr_interface::instruction::instruction_data::transact::TransactIxData;
use wincode::{SchemaRead, SchemaWrite};

use crate::{
    error::LoanError,
    instructions::shared::{check_after_window, IxData, LoanAuthority},
    verifier::cancel,
};

pub use spr_program::CompressedProof as CancelProof;

/// The cancel arguments the program reads ahead of the transact bytes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, SchemaRead, SchemaWrite)]
pub struct CancelArgs {
    pub proof: CancelProof,
    /// See [`CancelIxData::offer_expiry`].
    pub offer_expiry: u64,
    /// See [`CancelIxData::authority_bump`].
    pub authority_bump: u8,
}

/// The cancel instruction data as a client writes it: [`CancelArgs`], then
/// the transact data, which the program reads in place ([`IxData`]) and
/// forwards to SPP unchanged.
#[derive(Clone, Debug, PartialEq, Eq, SchemaRead, SchemaWrite)]
pub struct CancelIxData {
    pub proof: CancelProof,
    /// The committed offer `expiry` the cancel proof reveals as a public input.
    /// Separate from `transact.expiry_unix_ts` (the SPP relayer deadline): cancel
    /// requires `now > offer_expiry`, which is necessarily in the past, whereas
    /// SPP rejects a `transact` whose `expiry_unix_ts` is in the past. The
    /// offer's committed terms hash includes `offer_expiry`; the proof
    /// recomputes it.
    pub offer_expiry: u64,
    /// The bump of the lender's loan-authority PDA; see
    /// [`LoanAuthority::new`].
    pub authority_bump: u8,
    pub transact: TransactIxData,
}

/// 1. Check the fee payer and the lender signer.
/// 2. Decode the instruction and derive the lender's loan-authority PDA.
/// 3. Check `now > offer_expiry`.
/// 4. Verify the cancel proof against the expiry and the lender.
/// 5. Invoke SPP with the lender's loan-authority PDA signer.
#[inline(never)]
#[profile]
pub fn process_cancel_ix(accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    // 1. The lender signs the cancel; the cancel proof recomputes the offer's
    // committed lender owner hash from this pubkey, so only the lender can
    // cancel. The identity is tagged as a Solana key, like the owner hash the
    // offer commits.
    let mut iter = AccountIterator::new(accounts);
    iter.next_signer_mut("payer")?;
    let lender = *iter.next_signer("lender")?.address().as_array();
    let lender_owner_pk_field = solana_owner_identity(&lender).map_err(LoanError::from)?;

    // 2. Decode the instruction and derive the loan-authority PDA.
    let IxData {
        args:
            CancelArgs {
                proof,
                offer_expiry,
                authority_bump,
            },
        transact,
        transact_bytes,
    } = IxData::<CancelArgs>::parse(data)?;
    let loan_authority = LoanAuthority::new(&lender, authority_bump)?;

    // 3. Check `now > offer_expiry`.
    let clock = Clock::get()?;
    check_after_window(clock.unix_timestamp, offer_expiry)?;

    // 4. Verify the cancel proof.
    verify_cancel_proof(
        &proof,
        offer_expiry,
        lender_owner_pk_field,
        transact.private_tx_hash,
    )?;

    // 5. Invoke SPP with the lender's loan-authority PDA signer.
    let spp_accounts = iter.remaining()?;
    loan_authority.cpi_spp_transact_signed(spp_accounts, transact_bytes)
}

/// Hashes the cancel proof's public inputs and verifies the proof.
#[inline(never)]
#[profile]
fn verify_cancel_proof(
    proof: &CancelProof,
    expiry: u64,
    lender_owner_pk_field: [u8; 32],
    private_tx_hash: &[u8; 32],
) -> ProgramResult {
    cancel::Verifier {
        proof,
        public_inputs: cancel::PublicInputs {
            expiry,
            lender_owner_pk_field,
        },
        private_tx_hash,
        transfers: &[],
    }
    .verify()
    .map_err(LoanError::from)?;
    Ok(())
}
