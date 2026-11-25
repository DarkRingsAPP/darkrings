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
    verifier::originate,
};

pub use spr_program::CompressedProof as OriginateProof;

/// The originate arguments the program reads ahead of the transact bytes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, SchemaRead, SchemaWrite)]
pub struct OriginateArgs {
    pub proof: OriginateProof,
    /// See [`OriginateIxData::lender`].
    pub lender: [u8; 32],
    /// See [`OriginateIxData::viewing_pubkey`].
    pub viewing_pubkey: [u8; 33],
    /// See [`OriginateIxData::authority_bump`].
    pub authority_bump: u8,
}

/// The originate instruction data as a client writes it: [`OriginateArgs`],
/// then the transact bytes, which the program reads in place ([`IxData`])
/// and forwards to SPP unchanged.
#[derive(Clone, Debug, PartialEq, Eq, SchemaRead, SchemaWrite)]
pub struct OriginateIxData {
    pub proof: OriginateProof,
    /// The offer's lender (the marker's `lender_pubkey`), whose
    /// loan-authority PDA the program signs for; the new loan UTXO is bound
    /// to the same PDA. A wrong lender signs for a PDA that does not own
    /// the offer UTXO, and SPP rejects the spend.
    pub lender: [u8; 32],
    /// The viewing key of the loan UTXO's address, the lender's, which the
    /// loan output is encrypted to: the lender finds its loans by deriving
    /// its PDA's view tag and decrypting them.
    pub viewing_pubkey: [u8; 33],
    /// The bump of `lender`'s loan-authority PDA; see
    /// [`LoanAuthority::new`].
    pub authority_bump: u8,
    pub transact: TransactIxData,
}

/// 1. Check the fee payer.
/// 2. Decode the instruction and derive the lender's loan-authority PDA.
/// 3. Check `now <= expiry`, the expiry being the transact's
///    `expiry_unix_ts`.
/// 4. Verify the originate proof against the expiry, the first nullifier
///    and the loan UTXO's owner, the lender's loan-authority PDA.
/// 5. Invoke SPP with the lender's loan-authority PDA signer, which spends
///    the offer UTXO and authorizes the loan output; the borrower signs for
///    the collateral it owns.
#[inline(never)]
#[profile]
pub fn process_originate_ix(accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    // 1. Check the fee payer.
    let mut iter = AccountIterator::new(accounts);
    iter.next_signer_mut("payer")?;

    // 2. Decode the instruction and derive the loan-authority PDA.
    let IxData {
        args:
            OriginateArgs {
                proof,
                lender,
                viewing_pubkey,
                authority_bump,
            },
        transact,
        transact_bytes,
    } = IxData::<OriginateArgs>::parse(data)?;
    let loan_authority = LoanAuthority::new(&lender, authority_bump)?;

    // 3. Check `now <= expiry`.
    let clock = Clock::get()?;
    check_within_window(clock.unix_timestamp, transact.expiry_unix_ts)?;

    // 4. Verify the originate proof.
    let first_nullifier = transact
        .inputs
        .first()
        .ok_or(LoanError::InvalidInstructionData)?
        .nullifier_hash;
    let loan_owner = loan_authority.address_hash_with(&viewing_pubkey)?;
    verify_originate_proof(
        &proof,
        transact.expiry_unix_ts,
        first_nullifier,
        loan_owner,
        transact.private_tx_hash,
    )?;

    // 5. Invoke SPP with the lender's loan-authority PDA signer.
    let spp_accounts = iter.remaining()?;
    loan_authority.cpi_spp_transact_signed(spp_accounts, transact_bytes)
}

/// Hashes the originate proof's public inputs and verifies the proof.
#[inline(never)]
#[profile]
fn verify_originate_proof(
    proof: &OriginateProof,
    expiry: u64,
    first_nullifier: [u8; 32],
    loan_owner: [u8; 32],
    private_tx_hash: &[u8; 32],
) -> ProgramResult {
    originate::Verifier {
        proof,
        public_inputs: originate::PublicInputs {
            expiry,
            first_nullifier,
            loan_owner,
        },
        private_tx_hash,
        transfers: &[],
    }
    .verify()
    .map_err(LoanError::from)?;
    Ok(())
}
