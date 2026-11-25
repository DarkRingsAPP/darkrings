//! The loan blinding-seed derivation with spr-circuit's native Poseidon.
//! Byte I/O goes through decimal strings: spr-circuit's to_bytes/from_bytes
//! assume 64-bit limbs and silently corrupt fields on wasm32.
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = "blindingSeedDec")]
pub fn blinding_seed_dec(domain: u32, blinding_dec: &str) -> Result<String, JsError> {
    let field =
        spr_circuit::from_decimal(blinding_dec).map_err(|e| JsError::new(&format!("{e:?}")))?;
    let seed = spr_circuit::poseidon(&[spr_circuit::Field::from(domain), field])
        .map_err(|e| JsError::new(&format!("{e:?}")))?;
    Ok(seed.to_decimal())
}
