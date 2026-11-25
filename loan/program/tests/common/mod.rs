use mollusk_svm::Mollusk;
use solana_account::Account;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spr_interface::{
    instruction::instruction_data::transact::{
        CircuitId, MessageData, OwnerTag, TransactIxData, TransactOutput, TransactProof,
        TreeContext,
    },
    N_PUBLIC_SLOTS, SHIELDED_POOL_PROGRAM_ID,
};
use loan_program::{
    instructions::{
        cancel::{CancelIxData, CancelProof},
        offer::{OfferIxData, OfferProof, MarkerData},
        originate::{OriginateIxData, OriginateProof},
    },
    loan_authority_seeds, tag,
};

/// The lender the fixture's order authority is derived from: the cancel's
/// lender signer and the take's `lender` argument.
pub const MAKER: [u8; 32] = [22; 32];

/// The fee payer, and make's lender signer.
pub const PAYER: [u8; 32] = [21; 32];

/// The hash of the fixture transact's order output (output 1).
pub const ORDER_UTXO_HASH: [u8; 32] = [6; 32];

const SBF_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../target/deploy");

#[derive(Clone, Copy, Debug)]
pub enum Wrapper {
    Offer,
    Originate,
    Cancel,
}

impl Wrapper {
    pub fn tag(self) -> u8 {
        match self {
            Self::Offer => tag::OFFER,
            Self::Originate => tag::ORIGINATE,
            Self::Cancel => tag::CANCEL,
        }
    }

    fn signed(self) -> bool {
        !matches!(self, Self::Offer)
    }

    fn has_maker(self) -> bool {
        matches!(self, Self::Cancel)
    }

    /// The lender whose order-authority PDA the instruction signs for: make's
    /// payer, take's `lender` argument, cancel's lender signer.
    fn authority_maker(self) -> [u8; 32] {
        match self {
            Self::Offer => PAYER,
            Self::Originate | Self::Cancel => MAKER,
        }
    }

    fn authority_address(self, bump: &[u8; 1]) -> Option<Pubkey> {
        let lender = self.authority_maker();
        let [seed, maker_seed] = loan_authority_seeds(&lender);
        Pubkey::create_program_address(&[seed, maker_seed, bump], &loan_program_id()).ok()
    }

    /// The canonical bump of the order-authority PDA, which the SDK passes.
    pub fn canonical_bump(self) -> u8 {
        Pubkey::find_program_address(
            &loan_authority_seeds(&self.authority_maker()),
            &loan_program_id(),
        )
        .1
    }

    /// The highest bump that derives no program address: an on-curve point.
    pub fn invalid_bump(self) -> u8 {
        (0..=u8::MAX)
            .rev()
            .find(|bump| self.authority_address(&[*bump]).is_none())
            .expect("some bump derives an on-curve point")
    }
}

fn loan_program_id() -> Pubkey {
    Pubkey::new_from_array(*loan_program::ID.as_array())
}

pub fn setup_mollusk() -> (Mollusk, Pubkey) {
    crate::mollusk::mollusk_with_program(SBF_DIR, *loan_program::ID.as_array(), "loan_program")
}

pub fn account(lamports: u64) -> Account {
    Account {
        lamports,
        data: Vec::new(),
        owner: Pubkey::new_from_array([0; 32]),
        executable: false,
        rent_epoch: 0,
    }
}

pub fn transact(messages: Vec<MessageData>) -> TransactIxData {
    TransactIxData {
        expiry_unix_ts: u64::MAX,
        private_tx_hash: [1; 32],
        circuit: CircuitId::ConfidentialSigner(1, 2, N_PUBLIC_SLOTS as u8),
        tx_viewing_pk: [2; 33],
        salt: [3; 16],
        proof: TransactProof::zeroed(),
        inputs: Vec::new(),
        interface_transfers: Vec::new(),
        data_hash: None,
        ring_data_hash: None,
        outputs: vec![
            TransactOutput {
                utxo_hash: [4; 32],
                owner_tag: OwnerTag::Inline([5; 32]),
                data: None,
            },
            TransactOutput {
                utxo_hash: ORDER_UTXO_HASH,
                owner_tag: OwnerTag::Inline([7; 32]),
                data: Some(vec![8; 16]),
            },
        ],
        messages,
        tree_contexts: vec![TreeContext {
            utxo_tree_root_index: 0,
            nullifier_tree_root_index: 0,
        }],
    }
}

/// A marker message whose data is the [`MarkerData`] of `offer_utxo_hash`
/// and `lender_pubkey`.
pub fn marker(offer_utxo_hash: [u8; 32], lender_pubkey: [u8; 32]) -> MessageData {
    MessageData {
        view_tag: [9; 32],
        data: borsh::to_vec(&MarkerData {
            offer_utxo_hash,
            lender_pubkey,
        })
        .expect("serialize marker"),
    }
}

/// The marker the program expects of the fixture make.
pub fn valid_marker() -> MessageData {
    marker(ORDER_UTXO_HASH, PAYER)
}

/// The fixture's transact data: a make carries the valid marker.
pub fn fixture_transact(wrapper: Wrapper) -> TransactIxData {
    transact(if matches!(wrapper, Wrapper::Offer) {
        vec![valid_marker()]
    } else {
        Vec::new()
    })
}

pub fn wrapper_data(wrapper: Wrapper) -> Vec<u8> {
    wrapper_data_with(wrapper, fixture_transact(wrapper))
}

/// Serialize a wrapper body around a caller-customized transact payload, so
/// negatives can tamper with individual transact fields while staying
/// wire-valid.
pub fn wrapper_data_with(wrapper: Wrapper, transact: TransactIxData) -> Vec<u8> {
    wrapper_data_with_bump(wrapper, transact, wrapper.canonical_bump())
}

/// [`wrapper_data_with`] with `authority_bump` in place of the canonical bump.
pub fn wrapper_data_with_bump(
    wrapper: Wrapper,
    transact: TransactIxData,
    authority_bump: u8,
) -> Vec<u8> {
    let body = match wrapper {
        Wrapper::Offer => wincode::serialize(&OfferIxData {
            proof: OfferProof {
                a: [10; 32],
                b: [11; 64],
                c: [12; 32],
            },
            viewing_pubkey: [13; 33],
            authority_bump,
            transact,
        }),
        Wrapper::Originate => wincode::serialize(&OriginateIxData {
            viewing_pubkey: [2; 33],
            proof: OriginateProof {
                a: [10; 32],
                b: [11; 64],
                c: [12; 32],
            },
            lender: MAKER,
            authority_bump,
            transact,
        }),
        Wrapper::Cancel => wincode::serialize(&CancelIxData {
            proof: CancelProof {
                a: [10; 32],
                b: [11; 64],
                c: [12; 32],
            },
            offer_expiry: 0,
            authority_bump,
            transact,
        }),
    }
    .expect("serialize wrapper");
    let mut data = vec![wrapper.tag()];
    data.extend_from_slice(&body);
    data
}

pub fn fixture(wrapper: Wrapper) -> (Instruction, Vec<(Pubkey, Account)>) {
    let payer = Pubkey::new_from_array(PAYER);
    let lender = Pubkey::new_from_array(MAKER);
    let tree = Pubkey::new_from_array([23; 32]);
    let spp_id = Pubkey::new_from_array(SHIELDED_POOL_PROGRAM_ID);
    let swap_id = loan_program_id();
    let (loan_authority, _) =
        Pubkey::find_program_address(&loan_authority_seeds(&MAKER), &swap_id);

    let mut metas = vec![AccountMeta::new(payer, true)];
    let mut accounts = vec![(payer, account(1_000_000_000))];
    if wrapper.has_maker() {
        metas.push(AccountMeta::new_readonly(lender, true));
        accounts.push((lender, account(1_000_000_000)));
    }
    metas.push(AccountMeta::new(payer, true));
    accounts.push((payer, account(1_000_000_000)));
    metas.push(AccountMeta::new(tree, false));
    accounts.push((tree, account(1_000_000_000)));
    if wrapper.signed() {
        metas.push(AccountMeta::new_readonly(loan_authority, false));
        accounts.push((loan_authority, account(1_000_000_000)));
    }
    metas.push(AccountMeta::new_readonly(spp_id, false));
    accounts.push((
        spp_id,
        mollusk_svm::program::create_program_account_loader_v3(&spp_id),
    ));

    (
        Instruction {
            program_id: swap_id,
            accounts: metas,
            data: wrapper_data(wrapper),
        },
        accounts,
    )
}
