use loan_sdk::instructions::originate::originate_blinding_seed;
use spr_program::{poseidon, Field};
fn main() {
    let d = Field::from(loan_program::ORIGINATE_BLINDING_DOMAIN);
    let one = spr_program::from_decimal("1").unwrap();
    println!("domain_dec {}", d.to_decimal());
    println!("one_dec    {}", one.to_decimal());
    println!("hash_dec   {}", poseidon(&[d, one]).unwrap().to_decimal());
    let mut b = [0u8; 32];
    b[31] = 1;
    println!("seed_hex   {}", originate_blinding_seed(&b).unwrap().iter().map(|x| format!("{x:02x}")).collect::<String>());
}
