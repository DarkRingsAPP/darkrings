mod shared;

use std::time::Duration;

use anyhow::{anyhow, Result};
use loan_program::error::LoanError;
use loan_sdk::{
    index::index_taker,
    instructions::{
        offer::OfferTransactionParams,
        originate::{
            Originate, OriginateTransactionParams, LOAN_OUTPUT_SLOT, PRINCIPAL_OUTPUT_SLOT,
        },
        repay::{RepayTransactionParams, COLLATERAL_OUTPUT_SLOT, REPAYMENT_OUTPUT_SLOT},
    },
    loan_authority_bump, loan_authority_seeds,
    shared::identity,
    state::OfferTerms,
};
use shared::{
    send, setup, wait_for_merkle_proof, TestEnv, COLLATERAL_AMOUNT, PRINCIPAL_AMOUNT, REPAY_AMOUNT,
};
use solana_address::Address;
use spr_client::{user_registry::ensure_registered, Rpc};
use spr_transaction::{Mint, SOL_MINT};

const EXPIRY: u64 = 2_000_000_000;
const DEADLINE: u64 = 2_000_000_000;

/// Offset of `authority_bump` in the originate instruction data: the tag,
/// the 128-byte proof, the 32-byte lender, then the 33-byte viewing key.
const ORIGINATE_AUTHORITY_BUMP_OFFSET: usize = 1 + 128 + 32 + 33;

/// The highest bump below the canonical one that still derives a program
/// address of `lender`'s loan authority.
fn non_canonical_bump(lender: &Address) -> Result<u8> {
    let [seed, lender_seed] = loan_authority_seeds(lender.as_array());
    (0..loan_authority_bump(lender))
        .rev()
        .find(|bump| {
            Address::create_program_address(&[seed, lender_seed, &[*bump]], &loan_program::ID)
                .is_ok()
        })
        .ok_or_else(|| anyhow!("no non-canonical loan-authority bump"))
}

// A confidential loan's full happy path on the shielded pool -- offer,
// originate, repay -- driven against a real localnet (validator + Photon
// indexer + prover) that `setup()` starts.
//
// Flow:
//   1. Fund (in setup): 1.0 SPL shielded to the lender; 0.25 SOL and
//      0.44 SPL shielded to the borrower.
//   2. Offer: the lender spends its 1.0 SPL UTXO -> change 0.6 SPL (back to
//      the lender) + offer UTXO 0.4 SPL principal (owned by the
//      loan-authority PDA, designated to the borrower and encrypted to it),
//      plus the borrower's marker.
//   3. Discover: the borrower finds the marker, decrypts the offer and
//      checks the lender it names against the user registry.
//   4. Originate: the borrower spends the offer UTXO + its 0.25 SOL UTXO ->
//      principal 0.4 SPL (to the borrower) + loan UTXO 0.25 SOL collateral
//      (owned by the loan-authority PDA, terms committed). An originate
//      naming another lender fails first, as does one with a non-canonical
//      authority bump.
//   5. Repay: the borrower spends the loan UTXO + its 0.44 SPL UTXO ->
//      collateral 0.25 SOL (back to the borrower) + repayment 0.44 SPL (to
//      the lender). The borrower withholds the lender payout ciphertext;
//      the lender still derives it from the loan opening and the first
//      nullifier.
//   6. Assert both repay outputs are indexed.
//
// Net: lender 1.0 SPL -> 0.6 SPL + 0.44 SPL; borrower 0.25 SOL + 0.44 SPL
// -> 0.4 SPL + 0.25 SOL back. Nothing about the amounts is public on chain.
#[test]
fn offer_originate_repay_inline() -> Result<()> {
    let TestEnv {
        localnet,
        lender,
        lender_input,
        borrower,
        spl_mint,
    } = setup(2)?;
    let client = &localnet.client;
    let lender_address = lender.keypair.shielded_address()?;
    let lender_pubkey = lender_address.solana_address()?;
    let borrower_address = borrower.keypair.shielded_address()?;
    let borrower_pubkey = borrower_address.solana_address()?;
    ensure_registered(client.rpc(), &lender.keypair, &lender.keypair)
        .map_err(|e| anyhow!("register lender: {e:?}"))?;

    // 1. Offer, designated to the borrower.
    let terms = OfferTerms {
        collateral_mint: Mint::SOL,
        collateral_amount: COLLATERAL_AMOUNT,
        repay_amount: REPAY_AMOUNT,
        deadline: DEADLINE,
        lender: lender_address,
        expiry: EXPIRY,
        borrower: Some(identity(&borrower_pubkey)?),
    };
    assert_eq!(lender_input.utxo.asset, lender.registry.mint(&spl_mint)?);
    let offer_ix = OfferTransactionParams {
        terms,
        principal_amount: PRINCIPAL_AMOUNT,
        source: lender_input,
        borrower_address,
        payer: lender_pubkey,
    }
    .build(&lender.keypair)?
    .prove(client.indexer(), localnet.tree, &lender.keypair)?
    .instruction()?;
    let offer_signature = send(client.rpc(), &[&lender.keypair], offer_ix)?;
    client
        .confirm_private_transaction_sync(offer_signature)
        .map_err(|e| anyhow!("confirm offer indexed: {e:?}"))?;

    // 2. Discover the offer from the borrower's side.
    let discovered = index_taker(
        &borrower.keypair,
        &borrower.registry,
        client.indexer(),
        client.rpc(),
        Duration::from_secs(60),
    )?
    .pop()
    .ok_or_else(|| anyhow!("no loan offer discovered"))?;
    assert_eq!(discovered.lender_pubkey, lender_pubkey);
    let offer_utxo = discovered.offer_utxo;
    assert_eq!(offer_utxo.terms.repay_amount, REPAY_AMOUNT);
    assert_eq!(offer_utxo.terms.deadline, DEADLINE);

    // 3. Originate with the borrower's SOL collateral note.
    let collateral_input = borrower
        .spendable_utxo(SOL_MINT, COLLATERAL_AMOUNT)
        .ok_or_else(|| anyhow!("no spendable SOL note of {COLLATERAL_AMOUNT}"))?;
    let offer_state = wait_for_merkle_proof(
        client.indexer(),
        localnet.tree,
        offer_utxo.hash(localnet.tree_id)?,
    )?;
    let originate_transaction = OriginateTransactionParams {
        offer_utxo: offer_utxo.clone(),
        offer_leaf_index: offer_state.leaf_index,
        collateral_input,
        payer: borrower_pubkey,
        tree_id: localnet.tree_id,
    }
    .build(&borrower.keypair)?;
    let principal_output_hash = originate_transaction
        .spp_proof_inputs
        .external_data
        .outputs
        .get(PRINCIPAL_OUTPUT_SLOT)
        .ok_or_else(|| anyhow!("missing principal output"))?
        .utxo_hash;
    // The borrower derives its principal from the offer opening alone.
    let recovered = offer_utxo
        .derived_principal_output(&originate_transaction.first_nullifier, borrower_address)?;
    assert_eq!(recovered.hash(localnet.tree_id)?, principal_output_hash);
    let loan_utxo = originate_transaction.loan_utxo.clone();

    let originate = originate_transaction.prove(client.indexer(), localnet.tree, &borrower.keypair)?;
    assert_eq!(originate.lender, lender_pubkey);

    // An originate naming another lender fails at the originate proof
    // itself: the loan UTXO's owner, that lender's loan-authority PDA, is a
    // public input the proof binds, so the program rejects it before the
    // SPP CPI even runs.
    let wrong_lender_ix = Originate {
        lender: borrower_pubkey,
        ..originate.clone()
    }
    .instruction()?;
    let error = send(client.rpc(), &[&borrower.keypair], wrong_lender_ix)
        .expect_err("an originate naming another lender must fail");
    let proof_failed = LoanError::ProofVerificationFailed as u32;
    assert!(
        format!("{error:#}").contains(&format!("custom program error: {proof_failed:#x}")),
        "expected ProofVerificationFailed: {error:#}"
    );
    // A non-canonical bump of the same lender derives another PDA, which is
    // not among the transact accounts, so the program refuses to sign.
    let mut wrong_bump_ix = originate.clone().instruction()?;
    let bump = wrong_bump_ix
        .data
        .get_mut(ORIGINATE_AUTHORITY_BUMP_OFFSET)
        .ok_or_else(|| anyhow!("originate data has no authority bump"))?;
    assert_eq!(*bump, loan_authority_bump(&lender_pubkey));
    *bump = non_canonical_bump(&lender_pubkey)?;
    let error = send(client.rpc(), &[&borrower.keypair], wrong_bump_ix)
        .expect_err("an originate with a non-canonical authority bump must fail");
    // The non-canonical PDA changes the loan owner the program feeds the
    // proof, so the originate proof fails before the missing-signer check.
    assert!(
        format!("{error:#}").contains(&format!("custom program error: {proof_failed:#x}")),
        "expected ProofVerificationFailed: {error:#}"
    );

    let originate_signature = send(client.rpc(), &[&borrower.keypair], originate.instruction()?)?;
    client
        .confirm_private_transaction_sync(originate_signature)
        .map_err(|e| anyhow!("confirm originate indexed: {e:?}"))?;

    // 4. Repay with the borrower's SPL note, before the deadline.
    let repay_input = borrower
        .spendable_utxo(spl_mint, REPAY_AMOUNT)
        .ok_or_else(|| anyhow!("no spendable SPL note of {REPAY_AMOUNT}"))?;
    let loan_state = wait_for_merkle_proof(
        client.indexer(),
        localnet.tree,
        loan_utxo.hash(localnet.tree_id)?,
    )?;
    let mut repay_transaction = RepayTransactionParams {
        loan_utxo: loan_utxo.clone(),
        loan_leaf_index: loan_state.leaf_index,
        repay_input,
        payer: borrower_pubkey,
        tree_id: localnet.tree_id,
    }
    .build(&borrower.keypair)?;

    // 5. Withhold the lender payout ciphertext; the lender derives the
    // repayment from the loan opening and the published first nullifier.
    let outputs = &mut repay_transaction.spp_proof_inputs.external_data.outputs;
    let collateral_output_hash = outputs
        .get(COLLATERAL_OUTPUT_SLOT)
        .ok_or_else(|| anyhow!("missing collateral output"))?
        .utxo_hash;
    let payout = outputs
        .get_mut(REPAYMENT_OUTPUT_SLOT)
        .ok_or_else(|| anyhow!("missing lender repayment"))?;
    payout.data = None;
    let repayment_output_hash = payout.utxo_hash;
    let recovered = loan_utxo.derived_repayment_output(&repay_transaction.first_nullifier)?;
    assert_eq!(recovered.hash(localnet.tree_id)?, repayment_output_hash);

    let repay = repay_transaction.prove(client.indexer(), localnet.tree, &borrower.keypair)?;
    assert_eq!(repay.lender, lender_pubkey);
    assert_eq!(repay.deadline, DEADLINE);
    let repay_signature = send(client.rpc(), &[&borrower.keypair], repay.instruction()?)?;
    client
        .confirm_private_transaction_sync(repay_signature)
        .map_err(|e| anyhow!("confirm repay indexed: {e:?}"))?;

    // 6. Both repay outputs are indexed.
    client
        .indexer()
        .get_merkle_proofs(
            localnet.tree,
            vec![collateral_output_hash, repayment_output_hash],
            None,
        )
        .map_err(|e| anyhow!("repay outputs index: {e}"))?;
    Ok(())
}
