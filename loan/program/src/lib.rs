#[cfg(feature = "circuits")]
pub mod circuits;

pub mod error;
// The Xark circuit build (`--cfg xark`) compiles only the circuits: the
// instructions and the generated verifiers they call are the Solana program.
#[cfg(all(not(feature = "build-circuits"), not(xark)))]
pub mod instructions;
#[cfg(all(not(feature = "build-circuits"), not(xark)))]
#[rustfmt::skip] // Keep the generator's exact output for `zk compile --check`.
pub mod verifier;

#[cfg(all(not(feature = "build-circuits"), not(xark)))]
use pinocchio::{address::address_eq, error::ProgramError, AccountView, Address, ProgramResult};

#[cfg(all(not(feature = "build-circuits"), not(xark)))]
use crate::instructions::{
    process_cancel_ix, process_claim_ix, process_offer_ix, process_originate_ix, process_repay_ix,
};

pub mod tag {
    pub const OFFER: u8 = 0;
    pub const ORIGINATE: u8 = 1;
    pub const REPAY: u8 = 2;
    pub const CLAIM: u8 = 3;
    pub const CANCEL: u8 = 4;
}

pub const LOAN_AUTHORITY_PDA_SEED: &[u8] = b"loan_authority";

/// The seeds of a maker's order-authority PDA, `[LOAN_AUTHORITY_PDA_SEED,
/// maker]`. The PDA owns the maker's order UTXOs, so a maker finds them by
/// deriving it.
pub fn loan_authority_seeds(lender: &[u8; 32]) -> [&[u8]; 2] {
    [LOAN_AUTHORITY_PDA_SEED, lender]
}

/// Domain of the originate transaction's blinding seed,
/// `Poseidon(DROR, offer_utxo_blinding)`: the ASCII tag as a big-endian
/// 32-bit integer.
pub const ORIGINATE_BLINDING_DOMAIN: u32 = u32::from_be_bytes(*b"DROR");

/// Domain of the repay transaction's blinding seed,
/// `Poseidon(DRRP, loan_utxo_blinding)`.
pub const REPAY_BLINDING_DOMAIN: u32 = u32::from_be_bytes(*b"DRRP");

#[cfg(all(feature = "bpf-entrypoint", not(feature = "build-circuits"), not(xark)))]
mod entrypoint {
    pinocchio::entrypoint!(crate::process_instruction);
}

pinocchio::address::declare_id!("4j3MfrBtrhrLV4Lu7JpP5TqbAHbZY6AkLmMUaR3TZHfE");

#[cfg(all(not(feature = "build-circuits"), not(xark)))]
pub fn process_instruction(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if !address_eq(program_id, &crate::ID) {
        return Err(ProgramError::IncorrectProgramId);
    }

    let (ix_tag, ix_data) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;

    match *ix_tag {
        tag::OFFER => process_offer_ix(accounts, ix_data),
        tag::ORIGINATE => process_originate_ix(accounts, ix_data),
        tag::REPAY => process_repay_ix(accounts, ix_data),
        tag::CLAIM => process_claim_ix(accounts, ix_data),
        tag::CANCEL => process_cancel_ix(accounts, ix_data),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// Browser helpers the generated wasm module does not cover: the loan blinding
/// seed derivation, which the originate and repay circuits enforce.
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
mod wasm_extra {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen(js_name = "blindingSeed")]
    pub fn blinding_seed(domain: u32, blinding: &[u8]) -> Result<Vec<u8>, JsError> {
        let bytes: [u8; 32] = blinding
            .try_into()
            .map_err(|_| JsError::new("blinding must be 32 bytes"))?;
        // The circuits enforce spr-circuit's native Poseidon, which differs
        // from the hasher the wasm feature wires into spr_program::poseidon.
        let field = spr_circuit::from_bytes(&bytes).map_err(|e| JsError::new(&format!("{e:?}")))?;
        let seed = spr_circuit::poseidon(&[spr_circuit::Field::from(domain), field])
            .map_err(|e| JsError::new(&format!("{e:?}")))?;
        Ok(spr_circuit::to_bytes(&seed).to_vec())
    }
}
