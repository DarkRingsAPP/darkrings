//! Client SDK for the swap program: order state, transaction builders, Xark
//! proofs, instruction builders and order discovery.
pub mod index;
pub mod instructions;
pub mod proof;
pub mod shared;
pub mod state;

#[cfg(test)]
#[path = "../../../test-utils/utxo.rs"]
mod test_utxo;

use solana_address::Address;
use spr_program::ProgramOwner;
/// The program's wire types, which the instruction builders' fields name.
pub use loan_program::{
    instructions::{
        cancel::{CancelIxData, CancelProof},
        offer::{OfferIxData, OfferProof, MarkerData},
        originate::{OriginateIxData, OriginateProof},
        repay::{RepayIxData, RepayProof},
        claim::{ClaimIxData, ClaimProof},
    },
    loan_authority_seeds, tag, LOAN_AUTHORITY_PDA_SEED,
};

/// The order-authority PDA of `lender`, `[LOAN_AUTHORITY_PDA_SEED, lender]`,
/// which the swap program signs with (`invoke_signed`) to spend the lender's
/// order UTXOs. It owns them, holds no data, and is never created.
pub fn loan_authority_pda(lender: &Address) -> Address {
    *loan_authority(lender).pda()
}

/// The canonical bump of `lender`'s order-authority PDA, which the instruction
/// builders pass as `authority_bump`.
pub fn loan_authority_bump(lender: &Address) -> u8 {
    Address::find_program_address(&loan_authority_seeds(lender.as_array()), &loan_program::ID).1
}

/// The order-authority PDA of `lender` as a UTXO owner, under the zero
/// nullifier key. Its view tag finds the lender's order UTXOs.
pub fn loan_authority(lender: &Address) -> ProgramOwner {
    ProgramOwner::find(&loan_authority_seeds(lender.as_array()), &loan_program::ID)
}

pub(crate) fn err(e: impl core::fmt::Debug) -> anyhow::Error {
    anyhow::anyhow!("{e:?}")
}
