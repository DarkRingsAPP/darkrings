use loan_program::circuits as circuit;
use loan_sdk::{
    instructions::{originate::originate_blinding_seed, repay::repay_blinding_seed},
    loan_authority,
    proof::CircuitId,
    shared::identity,
    state::{LoanTerms, LoanUtxo, OfferTerms, OfferUtxo},
};
use solana_address::Address;
use solana_keypair::Keypair;
use spr_keypair::{ShieldedAddress, ShieldedKeypair};
use spr_program::{
    circuit::CheckedTransaction, to_bytes, ClientInputs, Field, InputRecords, ProgramProofInputs,
    ProgramTransaction, TxContext,
};
use spr_transaction::{instructions::transact::FinalizedTransaction, Data, Mint, Utxo, WalletUtxo};
use std::ops::{Deref, DerefMut};

/// The tree the spent UTXOs are in. Non-zero, and different from the output
/// tree, so a swapped or dropped tree id changes the commitments the proof
/// binds.
pub const INPUT_TREE_ID: u16 = 3;
pub const OUTPUT_TREE_ID: u16 = 7;
pub const EXPIRY: u64 = 1_700_000_000;
pub const DEADLINE: u64 = 1_700_600_000;
pub const PRINCIPAL_AMOUNT: u64 = 1_000;
pub const COLLATERAL_AMOUNT: u64 = 250;
pub const REPAY_AMOUNT: u64 = 1_100;
pub const OFFER_LEAF_INDEX: u64 = 5;
pub const LOAN_LEAF_INDEX: u64 = 9;

pub trait Execute: spr_program::xark::Input {
    fn execute(&self) -> Result<CheckedTransaction, spr_program::CircuitError>;
}

macro_rules! program {
    ($($name:ident),*) => {$(
        impl Execute for circuit::$name {
            fn execute(&self) -> Result<CheckedTransaction, spr_program::CircuitError> {
                circuit::$name::execute(self)
            }
        }
        pub type $name = Fixture<circuit::$name>;
    )*};
}
program!(Offer, Originate, Repay, Claim, Cancel);

/// A program's inputs and the native records they were converted from.
pub struct Fixture<P> {
    pub program: P,
    records: InputRecords,
    /// The transaction's sender: the lender for offer, claim and cancel,
    /// the borrower for originate and repay.
    pub sender: ShieldedKeypair,
}

impl<P> Deref for Fixture<P> {
    type Target = P;
    fn deref(&self) -> &P {
        &self.program
    }
}

impl<P> DerefMut for Fixture<P> {
    fn deref_mut(&mut self) -> &mut P {
        &mut self.program
    }
}

impl<P: Execute> Fixture<P> {
    pub fn sender_address(&self) -> ShieldedAddress {
        self.sender.shielded_address().unwrap()
    }

    pub fn create_program_transaction(&self) -> anyhow::Result<ProgramTransaction> {
        Ok(self.records.create_program_transaction(
            &self.program,
            self.execute()?,
            &self.sender_address(),
            Address::default(),
        )?)
    }

    pub fn create_finalized_transaction(&self) -> anyhow::Result<FinalizedTransaction> {
        Ok(self.create_program_transaction()?.finalized)
    }

    /// Converts `address` as a circuit input and records its viewing key.
    pub fn address(&mut self, address: ShieldedAddress) -> spr_program::ShieldedAddress {
        self.records.address(&address).unwrap()
    }

    /// Converts `wallet` as a circuit input and records it.
    pub fn utxo(&mut self, wallet: &WalletUtxo) -> spr_program::circuit::Utxo {
        self.records.utxo(wallet).unwrap()
    }

    /// Converts `mint` as a circuit input and records it.
    pub fn asset(&mut self, mint: Mint) -> [u8; 32] {
        self.records.asset(mint).unwrap()
    }

    /// Converts offer `terms` as a circuit input and records their mint.
    pub fn offer_terms(&mut self, terms: &OfferTerms) -> circuit::OfferTerms {
        circuit::OfferTerms::from_client(terms.circuit_terms().unwrap(), &mut self.records).unwrap()
    }

    /// Converts loan `terms` as a circuit input and records their mint.
    pub fn loan_terms(&mut self, terms: &LoanTerms) -> circuit::LoanTerms {
        circuit::LoanTerms::from_client(terms.circuit_terms().unwrap(), &mut self.records).unwrap()
    }
}

pub fn keypair() -> ShieldedKeypair {
    ShieldedKeypair::from_keypair(&Keypair::new()).unwrap()
}

pub fn principal_mint() -> Mint {
    Mint::new(Address::new_from_array([3; 32]), 2)
}

pub fn collateral_mint() -> Mint {
    Mint::new(Address::new_from_array([4; 32]), 3)
}

pub fn fe(value: u8) -> [u8; 32] {
    let mut bytes = [0; 32];
    bytes[31] = value;
    bytes
}

pub fn field(value: u8) -> Field {
    Field::from(value)
}

pub fn field_bytes(value: Field) -> [u8; 32] {
    to_bytes(&value)
}

pub fn context(seed: &[u8; 32]) -> TxContext {
    InputRecords::context(seed, Some(OUTPUT_TREE_ID)).unwrap()
}

/// The owner identity of a keypair's Solana address.
pub fn identity_of(keypair: &ShieldedKeypair) -> [u8; 32] {
    identity(
        &keypair
            .shielded_address()
            .unwrap()
            .solana_address()
            .unwrap(),
    )
    .unwrap()
}

pub fn terms(lender: &ShieldedKeypair, borrower: Option<[u8; 32]>) -> OfferTerms {
    OfferTerms {
        collateral_mint: collateral_mint(),
        collateral_amount: COLLATERAL_AMOUNT,
        repay_amount: REPAY_AMOUNT,
        deadline: DEADLINE,
        lender: lender.shielded_address().unwrap(),
        expiry: EXPIRY,
        borrower,
    }
}

pub fn offer_utxo(terms: OfferTerms) -> OfferUtxo {
    OfferUtxo {
        terms,
        blinding: fe(7),
        principal_mint: principal_mint(),
        principal_amount: PRINCIPAL_AMOUNT,
    }
}

/// A loan between `lender` and `borrower` on the standard terms.
pub fn loan_utxo(lender: &ShieldedKeypair, borrower: &ShieldedKeypair) -> LoanUtxo {
    let borrower_owner = *InputRecords::new()
        .address(&borrower.shielded_address().unwrap())
        .unwrap()
        .owner();
    LoanUtxo {
        terms: LoanTerms {
            principal_mint: principal_mint(),
            repay_amount: REPAY_AMOUNT,
            lender: lender.shielded_address().unwrap(),
            borrower: borrower_owner,
            deadline: DEADLINE,
        },
        blinding: fe(11),
        collateral_mint: collateral_mint(),
        collateral_amount: COLLATERAL_AMOUNT,
    }
}

/// `amount` of `mint` owned by `owner`, at leaf 6 of [`INPUT_TREE_ID`].
pub fn wallet_utxo(owner: &ShieldedKeypair, mint: Mint, amount: u64) -> WalletUtxo {
    crate::utxo::wallet_utxo(
        Utxo {
            owner: owner.signing_pubkey(),
            asset: mint,
            amount,
            blinding: fe(13),
            ring_program_id: None,
            data: Data::default(),
        },
        &owner.nullifier_key,
        INPUT_TREE_ID,
        6,
    )
}

/// The offer UTXO address an offer by `lender` encrypted to `borrower` uses:
/// the lender's loan-authority PDA with the borrower's viewing key.
pub fn offer_address(lender: &ShieldedKeypair, borrower: &ShieldedKeypair) -> ShieldedAddress {
    loan_authority(&lender.shielded_address().unwrap().solana_address().unwrap())
        .address(borrower.viewing_pubkey())
        .unwrap()
}

/// The loan UTXO address of `lender`: its loan-authority PDA with its own
/// viewing key.
pub fn loan_address(lender: &ShieldedKeypair) -> ShieldedAddress {
    loan_authority(&lender.shielded_address().unwrap().solana_address().unwrap())
        .address(lender.viewing_pubkey())
        .unwrap()
}

/// An offer locking `principal_amount` of a `principal_amount + change_amount`
/// source owned by the lender, designated to and encrypted for `borrower`.
pub fn offer_inputs(principal_amount: u64, change_amount: u64) -> Offer {
    let lender = keypair();
    let borrower = keypair();
    let offer_address = offer_address(&lender, &borrower);
    let source = wallet_utxo(&lender, principal_mint(), principal_amount + change_amount);
    let lender_owner_pk_field = spr_program::from_bytes(&identity_of(&lender)).unwrap();
    let mut fixture = Fixture {
        program: circuit::Offer {
            private: circuit::OfferPrivateInputs {
                tx_context: context(&fe(41)),
                source: spr_program::circuit::Utxo::dummy(),
                principal_amount,
                collateral_mint: [0; 32],
                collateral_amount: COLLATERAL_AMOUNT,
                repay_amount: REPAY_AMOUNT,
                deadline: DEADLINE,
                expiry: EXPIRY,
                borrower_pk_fe: identity_of(&borrower),
            },
            public: circuit::OfferPublicInputs {
                lender_owner_pk_field,
                offer_owner: spr_program::ShieldedAddress::default(),
            },
        },
        records: InputRecords::new(),
        sender: lender,
    };
    fixture.program.private.collateral_mint = fixture.asset(collateral_mint());
    fixture.program.private.source = fixture.records.utxo(&source).unwrap();
    fixture.program.public.offer_owner = fixture.address(offer_address);
    fixture
}

/// The offer terms an offer of `inputs` commits: its terms with the source
/// owner, the lender, as the lender.
pub fn committed_offer_terms(inputs: &mut Offer) -> circuit::OfferTerms {
    let private = &inputs.program.private;
    let (collateral_mint, collateral_amount, repay_amount, deadline, expiry, borrower_pk_fe) = (
        private.collateral_mint,
        private.collateral_amount,
        private.repay_amount,
        private.deadline,
        private.expiry,
        private.borrower_pk_fe,
    );
    let lender = *inputs.address(inputs.sender_address()).owner();
    circuit::OfferTerms {
        collateral_mint,
        collateral_amount,
        repay_amount,
        deadline,
        lender,
        expiry,
        borrower_pk_fe,
    }
}

/// An originate of the offer of [`offer_utxo`] at [`OFFER_LEAF_INDEX`] by
/// `borrower`, with the originate blinding seed and the lender's loan
/// address for the loan UTXO.
pub fn originate_inputs(offer: &OfferUtxo, borrower: ShieldedKeypair) -> Originate {
    let offer_input = offer
        .to_input_utxo(INPUT_TREE_ID, OFFER_LEAF_INDEX)
        .unwrap();
    let collateral_input = wallet_utxo(&borrower, collateral_mint(), COLLATERAL_AMOUNT);
    let loan_owner = offer
        .terms
        .lender
        .clone();
    let mut fixture = Fixture {
        program: circuit::Originate {
            private: circuit::OriginatePrivateInputs {
                tx_context: context(&originate_blinding_seed(&offer.blinding).unwrap()),
                terms: circuit::OfferTerms::default(),
                offer_utxo: spr_program::circuit::Utxo::dummy(),
                collateral_in: spr_program::circuit::Utxo::dummy(),
            },
            public: circuit::OriginatePublicInputs {
                expiry: offer.terms.expiry,
                first_nullifier: spr_program::from_bytes(&offer_input.nullifier).unwrap(),
                loan_owner: spr_program::ShieldedAddress::default(),
            },
        },
        records: InputRecords::new(),
        sender: borrower,
    };
    fixture.program.private.terms = fixture.offer_terms(&offer.terms);
    fixture.program.private.offer_utxo = fixture.records.utxo(&offer_input).unwrap();
    fixture.program.private.collateral_in = fixture.records.utxo(&collateral_input).unwrap();
    let loan_authority_address =
        loan_authority(&loan_owner.solana_address().unwrap())
            .address(loan_owner.viewing_pubkey)
            .unwrap();
    fixture.program.public.loan_owner = fixture.address(loan_authority_address);
    fixture
}

/// A repay of the loan of [`loan_utxo`] at [`LOAN_LEAF_INDEX`] by the
/// borrower, with the repay blinding seed.
pub fn repay_inputs(loan: &LoanUtxo, borrower: ShieldedKeypair) -> Repay {
    let loan_input = loan.to_input_utxo(INPUT_TREE_ID, LOAN_LEAF_INDEX).unwrap();
    let repay_input = wallet_utxo(&borrower, principal_mint(), REPAY_AMOUNT);
    let mut fixture = Fixture {
        program: circuit::Repay {
            private: circuit::RepayPrivateInputs {
                tx_context: context(&repay_blinding_seed(&loan.blinding).unwrap()),
                terms: circuit::LoanTerms::default(),
                loan_utxo: spr_program::circuit::Utxo::dummy(),
                repay_in: spr_program::circuit::Utxo::dummy(),
                lender_address: spr_program::ShieldedAddress::default(),
            },
            public: circuit::RepayPublicInputs {
                deadline: loan.terms.deadline,
                first_nullifier: spr_program::from_bytes(&loan_input.nullifier).unwrap(),
            },
        },
        records: InputRecords::new(),
        sender: borrower,
    };
    fixture.program.private.terms = fixture.loan_terms(&loan.terms);
    fixture.program.private.loan_utxo = fixture.records.utxo(&loan_input).unwrap();
    fixture.program.private.repay_in = fixture.records.utxo(&repay_input).unwrap();
    fixture.program.private.lender_address = fixture.address(loan.terms.lender);
    fixture
}

/// A claim of the loan of [`loan_utxo`] at [`LOAN_LEAF_INDEX`] by the lender.
pub fn claim_inputs(loan: &LoanUtxo, lender: ShieldedKeypair) -> Claim {
    let loan_input = loan.to_input_utxo(INPUT_TREE_ID, LOAN_LEAF_INDEX).unwrap();
    let lender_owner_pk_field = spr_program::from_bytes(&identity_of(&lender)).unwrap();
    let mut fixture = Fixture {
        program: circuit::Claim {
            private: circuit::ClaimPrivateInputs {
                tx_context: context(&fe(47)),
                loan_utxo: spr_program::circuit::Utxo::dummy(),
                terms: circuit::LoanTerms::default(),
            },
            public: circuit::ClaimPublicInputs {
                deadline: loan.terms.deadline,
                lender_owner_pk_field,
            },
        },
        records: InputRecords::new(),
        sender: lender,
    };
    fixture.program.private.terms = fixture.loan_terms(&loan.terms);
    fixture.program.private.loan_utxo = fixture.records.utxo(&loan_input).unwrap();
    fixture
}

/// A cancel of an offer of `lender` at [`OFFER_LEAF_INDEX`].
pub fn cancel_inputs() -> Cancel {
    let lender = keypair();
    let offer = offer_utxo(terms(&lender, None));
    let offer_input = offer
        .to_input_utxo(INPUT_TREE_ID, OFFER_LEAF_INDEX)
        .unwrap();
    let lender_owner_pk_field = spr_program::from_bytes(&identity_of(&lender)).unwrap();
    let mut fixture = Fixture {
        program: circuit::Cancel {
            private: circuit::CancelPrivateInputs {
                tx_context: context(&fe(43)),
                terms: circuit::OfferTerms::default(),
                offer_utxo: spr_program::circuit::Utxo::dummy(),
            },
            public: circuit::CancelPublicInputs {
                expiry: EXPIRY,
                lender_owner_pk_field,
            },
        },
        records: InputRecords::new(),
        sender: lender,
    };
    fixture.program.private.terms = fixture.offer_terms(&offer.terms);
    fixture.program.private.offer_utxo = fixture.records.utxo(&offer_input).unwrap();
    fixture
}

/// Proves `inputs` with the checked circuit, verifies the proof against `vk`
/// with the transaction's public hash, and checks a tampered public hash
/// fails. Returns the program transaction and the proof.
pub fn prove_and_verify<P: Execute>(
    id: CircuitId,
    inputs: &Fixture<P>,
    vk: &groth16_solana::groth16::Groth16Verifyingkey,
) -> (ProgramTransaction, spr_program::CompressedProof) {
    let tx = inputs.create_program_transaction().unwrap();
    let (_private, circuit) = loan_sdk::proof::checked_circuit(id).unwrap();
    circuit.check_constrained(tx.proof_inputs.clone()).unwrap();
    let proof = loan_sdk::proof::prove(id, &tx.proof_inputs).unwrap();
    assert!(
        proof.a.iter().any(|&byte| byte != 0),
        "proof_a must not be all zero"
    );
    let a = groth16_solana::decompression::decompress_g1(&proof.a).unwrap();
    let b = groth16_solana::decompression::decompress_g2(&proof.b).unwrap();
    let c = groth16_solana::decompression::decompress_g1(&proof.c).unwrap();
    groth16_solana::groth16::Groth16Verifier::new(&a, &b, &c, &[tx.public_hash], vk)
        .unwrap()
        .verify()
        .unwrap();
    let mut tampered = tx.public_hash;
    tampered[31] ^= 1;
    assert!(
        groth16_solana::groth16::Groth16Verifier::new(&a, &b, &c, &[tampered], vk)
            .unwrap()
            .verify()
            .is_err(),
        "verification must fail for a tampered public input"
    );
    (tx, proof)
}

/// Checks that both the native execution and the compiled circuit refuse
/// `inputs`.
pub fn assert_invalid<P: Execute>(id: CircuitId, inputs: &Fixture<P>) {
    let native = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        spr_program::checked(|| inputs.execute())
    }));
    assert!(
        !matches!(native, Ok(Ok(_))),
        "the native circuit accepted invalid inputs"
    );
    let (_private, circuit) = loan_sdk::proof::checked_circuit(id).unwrap();
    let error = circuit
        .check(ProgramProofInputs::new(&inputs.program, Field::zero()))
        .expect_err("the compiled circuit must reject invalid inputs");
    assert!(
        error.to_string().contains("program.execute()"),
        "expected the program's constraint to fail before the outer public-hash check: {error}"
    );
}
