use light_program_profiler::profile;
use pinocchio::{
    sysvars::{clock::Clock, Sysvar},
    AccountView, ProgramResult,
};
use spr_account_checks::AccountIterator;
use spr_interface::instruction::instruction_data::transact::TransactIxData;
use wincode::{SchemaRead, SchemaWrite};

use crate::{
    error::LoanError,
    instructions::shared::{check_within_window, IxData, LoanAuthority},
    verifier::repay,
};

pub use spr_program::CompressedProof as RepayProof;

/// The repay arguments the program reads ahead of the transact bytes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, SchemaRead, SchemaWrite)]
pub struct RepayArgs {
    pub proof: RepayProof,
    /// See [`RepayIxData::lender`].
    pub lender: [u8; 32],
    /// See [`RepayIxData::deadline`].
    pub deadline: u64,
    /// See [`RepayIxData::authority_bump`].
    pub authority_bump: u8,
}

/// The repay instruction data as a client writes it: [`RepayArgs`], then the
/// transact bytes, which the program reads in place ([`IxData`]) and
/// forwards to SPP unchanged.
#[derive(Clone, Debug, PartialEq, Eq, SchemaRead, SchemaWrite)]
pub struct RepayIxData {
    pub proof: RepayProof,
    /// The loan's lender, whose loan-authority PDA owns the loan UTXO the
    /// repay spends. A wrong lender signs for a PDA that does not own the
    /// loan UTXO, and SPP rejects the spend.
    pub lender: [u8; 32],
    /// The committed loan `deadline` the repay proof reveals as a public
    /// input. Repay requires `now <= deadline`: the borrower reclaims the
    /// collateral only while the loan is live.
    pub deadline: u64,
    /// The bump of `lender`'s loan-authority PDA; see
    /// [`LoanAuthority::new`].
    pub authority_bump: u8,
    pub transact: TransactIxData,
}

/// 1. Check the fee payer.
/// 2. Decode the instruction and derive the lender's loan-authority PDA.
/// 3. Check `now <= deadline`.
/// 4. Verify the repay proof against the deadline and the first nullifier.
/// 5. Invoke SPP with the lender's loan-authority PDA signer, which spends
///    the loan UTXO; the borrower signs for the repayment input it owns.
#[inline(never)]
#[profile]
pub fn process_repay_ix(accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    // 1. Check the fee payer.
    let mut iter = AccountIterator::new(accounts);
    iter.next_signer_mut("payer")?;

    // 2. Decode the instruction and derive the loan-authority PDA.
    let IxData {
        args:
            RepayArgs {
                proof,
                lender,
                deadline,
                authority_bump,
            },
        transact,
        transact_bytes,
    } = IxData::<RepayArgs>::parse(data)?;
    let loan_authority = LoanAuthority::new(&lender, authority_bump)?;

    // 3. Check `now <= deadline`: repay is only live before the deadline;
    // after it, claim moves the collateral to the lender.
    let clock = Clock::get()?;
    check_within_window(clock.unix_timestamp, deadline)?;

    // 4. Verify the repay proof.
    let first_nullifier = transact
        .inputs
        .first()
        .ok_or(LoanError::InvalidInstructionData)?
        .nullifier_hash;
    verify_repay_proof(&proof, deadline, first_nullifier, transact.private_tx_hash)?;

    // 5. Invoke SPP with the lender's loan-authority PDA signer.
    let spp_accounts = iter.remaining()?;
    loan_authority.cpi_spp_transact_signed(spp_accounts, transact_bytes)
}

/// Hashes the repay proof's public inputs and verifies the proof.
#[inline(never)]
#[profile]
fn verify_repay_proof(
    proof: &RepayProof,
    deadline: u64,
    first_nullifier: [u8; 32],
    private_tx_hash: &[u8; 32],
) -> ProgramResult {
    repay::Verifier {
        proof,
        public_inputs: repay::PublicInputs {
            deadline,
            first_nullifier,
        },
        private_tx_hash,
        transfers: &[],
    }
    .verify()
    .map_err(LoanError::from)?;
    Ok(())
}
