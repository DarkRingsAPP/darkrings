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
    verifier::claim,
};

pub use spr_program::CompressedProof as ClaimProof;

/// The claim arguments the program reads ahead of the transact bytes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, SchemaRead, SchemaWrite)]
pub struct ClaimArgs {
    pub proof: ClaimProof,
    /// See [`ClaimIxData::deadline`].
    pub deadline: u64,
    /// See [`ClaimIxData::authority_bump`].
    pub authority_bump: u8,
}

/// The claim instruction data as a client writes it: [`ClaimArgs`], then the
/// transact data, which the program reads in place ([`IxData`]) and forwards
/// to SPP unchanged.
#[derive(Clone, Debug, PartialEq, Eq, SchemaRead, SchemaWrite)]
pub struct ClaimIxData {
    pub proof: ClaimProof,
    /// The committed loan `deadline` the claim proof reveals as a public
    /// input. Claim requires `now > deadline`: a defaulted loan's collateral
    /// goes to the lender. Separate from `transact.expiry_unix_ts` (the SPP
    /// relayer deadline): the deadline is necessarily in the past, whereas
    /// SPP rejects a `transact` whose `expiry_unix_ts` is in the past.
    pub deadline: u64,
    /// The bump of the lender's loan-authority PDA; see
    /// [`LoanAuthority::new`].
    pub authority_bump: u8,
    pub transact: TransactIxData,
}

/// 1. Check the fee payer and the lender signer.
/// 2. Decode the instruction and derive the lender's loan-authority PDA.
/// 3. Check `now > deadline`.
/// 4. Verify the claim proof against the deadline and the lender.
/// 5. Invoke SPP with the lender's loan-authority PDA signer.
#[inline(never)]
#[profile]
pub fn process_claim_ix(accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    // 1. The lender signs the claim; the claim proof recomputes the loan's
    // committed lender owner hash from this pubkey, so only the lender can
    // claim. The identity is tagged as a Solana key, like the owner hash
    // the loan commits.
    let mut iter = AccountIterator::new(accounts);
    iter.next_signer_mut("payer")?;
    let lender = *iter.next_signer("lender")?.address().as_array();
    let lender_owner_pk_field = solana_owner_identity(&lender).map_err(LoanError::from)?;

    // 2. Decode the instruction and derive the loan-authority PDA.
    let IxData {
        args:
            ClaimArgs {
                proof,
                deadline,
                authority_bump,
            },
        transact,
        transact_bytes,
    } = IxData::<ClaimArgs>::parse(data)?;
    let loan_authority = LoanAuthority::new(&lender, authority_bump)?;

    // 3. Check `now > deadline`: the loan defaulted.
    let clock = Clock::get()?;
    check_after_window(clock.unix_timestamp, deadline)?;

    // 4. Verify the claim proof.
    verify_claim_proof(
        &proof,
        deadline,
        lender_owner_pk_field,
        transact.private_tx_hash,
    )?;

    // 5. Invoke SPP with the lender's loan-authority PDA signer.
    let spp_accounts = iter.remaining()?;
    loan_authority.cpi_spp_transact_signed(spp_accounts, transact_bytes)
}

/// Hashes the claim proof's public inputs and verifies the proof.
#[inline(never)]
#[profile]
fn verify_claim_proof(
    proof: &ClaimProof,
    deadline: u64,
    lender_owner_pk_field: [u8; 32],
    private_tx_hash: &[u8; 32],
) -> ProgramResult {
    claim::Verifier {
        proof,
        public_inputs: claim::PublicInputs {
            deadline,
            lender_owner_pk_field,
        },
        private_tx_hash,
        transfers: &[],
    }
    .verify()
    .map_err(LoanError::from)?;
    Ok(())
}
