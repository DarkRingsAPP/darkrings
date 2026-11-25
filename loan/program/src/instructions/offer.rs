use borsh::{BorshDeserialize, BorshSerialize};
use light_program_profiler::profile;
use pinocchio::{AccountView, ProgramResult};
use spr_account_checks::AccountIterator;
use spr_interface::instruction::instruction_data::transact::{TransactIxData, TransactIxDataRef};
use wincode::{SchemaRead, SchemaWrite};

use crate::{
    error::LoanError,
    instructions::shared::{IxData, LoanAuthority},
    verifier::offer,
};

/// The offer transaction's single message: the offer UTXO's hash and the
/// lender, Borsh-encoded (64 bytes), which the borrower's discovery reads.
#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshDeserialize, BorshSerialize)]
pub struct MarkerData {
    pub offer_utxo_hash: [u8; 32],
    pub lender_pubkey: [u8; 32],
}

pub use spr_program::CompressedProof as OfferProof;

/// The offer arguments the program reads ahead of the transact bytes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, SchemaRead, SchemaWrite)]
pub struct OfferArgs {
    pub proof: OfferProof,
    /// See [`OfferIxData::viewing_pubkey`].
    pub viewing_pubkey: [u8; 33],
    /// See [`OfferIxData::authority_bump`].
    pub authority_bump: u8,
}

/// The offer instruction data as a client writes it: [`OfferArgs`], then the
/// transact data, which the program reads in place ([`IxData`]) and forwards
/// to SPP unchanged.
#[derive(Clone, Debug, PartialEq, Eq, SchemaRead, SchemaWrite)]
pub struct OfferIxData {
    pub proof: OfferProof,
    /// The viewing key of the offer UTXO's address, the borrower's, which
    /// the offer output is encrypted to. The offer proof's public
    /// `offer_owner` is the lender's loan-authority PDA with this viewing
    /// key.
    pub viewing_pubkey: [u8; 33],
    /// The bump of the lender's loan-authority PDA; see
    /// [`LoanAuthority::new`].
    pub authority_bump: u8,
    /// Carries exactly one message, the marker, whose data is
    /// [`MarkerData`] of the offer output and the lender signer.
    pub transact: TransactIxData,
}

const OFFER_OUTPUT_INDEX: usize = 1;

/// 1. Check the lender signer.
/// 2. Decode the instruction and derive the lender's loan-authority PDA.
/// 3. Check the marker message names the offer UTXO and the lender.
/// 4. Verify the offer proof against the transaction, the lender and the
///    offer UTXO's owner, the lender's loan-authority PDA.
/// 5. Invoke SPP with the loan-authority PDA signer, which authorizes the
///    offer output; the lender signs for the source it owns.
#[inline(never)]
#[profile]
pub fn process_offer_ix(accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    // 1. Check the lender signer. The offer proof checks the source owner's
    // identity against this pubkey, so the marker names the offer's lender.
    let mut iter = AccountIterator::new(accounts);
    let lender_pubkey = *iter.next_signer_mut("payer")?.address().as_array();

    // 2. Decode the instruction and derive the loan-authority PDA.
    let IxData {
        args:
            OfferArgs {
                proof,
                viewing_pubkey,
                authority_bump,
            },
        transact,
        transact_bytes,
    } = IxData::<OfferArgs>::parse(data)?;
    let loan_authority = LoanAuthority::new(&lender_pubkey, authority_bump)?;

    // 3. Check the marker message. SPP hashes the messages into the external
    // data its proof covers, so the program checks the client's marker
    // instead of writing it, and forwards the bytes unchanged.
    check_marker(&transact, lender_pubkey)?;

    // 4. Verify the offer proof against the transaction, the lender and the
    // offer UTXO's owner. SPP accepts a data-bearing output owned by any
    // owner signer, the lender included; the proof binds it to the PDA.
    let public_inputs = loan_authority.offer_public_inputs(&viewing_pubkey)?;
    verify_offer_proof(&proof, public_inputs, transact.private_tx_hash)?;

    // 5. Invoke SPP with the lender's loan-authority PDA signer.
    let spp_accounts = iter.remaining()?;
    loan_authority.cpi_spp_transact_signed(spp_accounts, transact_bytes)
}

/// The transaction carries exactly one message, whose data is the
/// [`MarkerData`] of the offer output's hash and `lender_pubkey`.
fn check_marker(transact: &TransactIxDataRef, lender_pubkey: [u8; 32]) -> ProgramResult {
    let offer_utxo_hash = transact
        .outputs
        .get(OFFER_OUTPUT_INDEX)
        .ok_or(LoanError::InvalidInstructionData)?
        .utxo_hash;
    let [marker_message] = transact.messages.as_slice() else {
        return Err(LoanError::InvalidMarkerMessage.into());
    };
    // Compare the Borsh encoding, `offer_utxo_hash || lender_pubkey`, in
    // place. Slice equality also checks the lengths, so the data is 64 bytes.
    let (marker_offer_utxo_hash, marker_lender_pubkey) = marker_message
        .data
        .split_at_checked(32)
        .ok_or(LoanError::InvalidMarkerData)?;
    if marker_offer_utxo_hash != offer_utxo_hash.as_slice()
        || marker_lender_pubkey != lender_pubkey.as_slice()
    {
        return Err(LoanError::InvalidMarkerData.into());
    }
    Ok(())
}

/// Hashes the offer proof's public inputs and verifies the proof.
#[inline(never)]
#[profile]
fn verify_offer_proof(
    proof: &OfferProof,
    public_inputs: offer::PublicInputs,
    private_tx_hash: &[u8; 32],
) -> ProgramResult {
    offer::Verifier {
        proof,
        public_inputs,
        private_tx_hash,
        transfers: &[],
    }
    .verify()
    .map_err(LoanError::from)?;
    Ok(())
}
