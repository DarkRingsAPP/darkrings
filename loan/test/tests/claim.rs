mod shared;

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Result};
use loan_program::error::LoanError;
use loan_sdk::{
    index::index_taker,
    instructions::{claim::ClaimTransactionParams, offer::OfferTransactionParams, originate::OriginateTransactionParams},
    shared::identity,
    state::OfferTerms,
};
use shared::{
    send, setup, wait_for_merkle_proof, TestEnv, COLLATERAL_AMOUNT, PRINCIPAL_AMOUNT, REPAY_AMOUNT,
};
use spr_client::{user_registry::ensure_registered, Rpc};
use spr_transaction::{Mint, SOL_MINT};

const EXPIRY: u64 = 2_000_000_000;

// A confidential loan's default path -- offer, originate, then claim after
// the deadline -- on the same localnet as loan.rs.
//
// The loan's deadline is a few seconds away. A claim before it fails with
// the program's window check; once it passes, the lender claims the 0.25 SOL
// collateral. The borrower keeps the 0.4 SPL principal and never repays.
#[test]
fn offer_originate_claim_after_deadline_inline() -> Result<()> {
    let TestEnv {
        localnet,
        lender,
        lender_input,
        borrower,
        spl_mint: _,
    } = setup(3)?;
    let client = &localnet.client;
    let lender_address = lender.keypair.shielded_address()?;
    let lender_pubkey = lender_address.solana_address()?;
    let borrower_address = borrower.keypair.shielded_address()?;
    let borrower_pubkey = borrower_address.solana_address()?;
    ensure_registered(client.rpc(), &lender.keypair, &lender.keypair)
        .map_err(|e| anyhow!("register lender: {e:?}"))?;

    // 1. Offer with a deadline a few seconds away.
    let deadline = SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_secs()
        + 20;
    let terms = OfferTerms {
        collateral_mint: Mint::SOL,
        collateral_amount: COLLATERAL_AMOUNT,
        repay_amount: REPAY_AMOUNT,
        deadline,
        lender: lender_address,
        expiry: EXPIRY,
        borrower: Some(identity(&borrower_pubkey)?),
    };
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

    // 2. Originate.
    let discovered = index_taker(
        &borrower.keypair,
        &borrower.registry,
        client.indexer(),
        client.rpc(),
        Duration::from_secs(60),
    )?
    .pop()
    .ok_or_else(|| anyhow!("no loan offer discovered"))?;
    let offer_utxo = discovered.offer_utxo;
    let collateral_input = borrower
        .spendable_utxo(SOL_MINT, COLLATERAL_AMOUNT)
        .ok_or_else(|| anyhow!("no spendable SOL note of {COLLATERAL_AMOUNT}"))?;
    let offer_state = wait_for_merkle_proof(
        client.indexer(),
        localnet.tree,
        offer_utxo.hash(localnet.tree_id)?,
    )?;
    let originate_transaction = OriginateTransactionParams {
        offer_utxo,
        offer_leaf_index: offer_state.leaf_index,
        collateral_input,
        payer: borrower_pubkey,
        tree_id: localnet.tree_id,
    }
    .build(&borrower.keypair)?;
    let loan_utxo = originate_transaction.loan_utxo.clone();
    let originate_signature = send(
        client.rpc(),
        &[&borrower.keypair],
        originate_transaction
            .prove(client.indexer(), localnet.tree, &borrower.keypair)?
            .instruction()?,
    )?;
    client
        .confirm_private_transaction_sync(originate_signature)
        .map_err(|e| anyhow!("confirm originate indexed: {e:?}"))?;

    // 3. A claim before the deadline fails the program's window check.
    let loan_state = wait_for_merkle_proof(
        client.indexer(),
        localnet.tree,
        loan_utxo.hash(localnet.tree_id)?,
    )?;
    let early_claim_ix = ClaimTransactionParams {
        loan_utxo: loan_utxo.clone(),
        loan_leaf_index: loan_state.leaf_index,
        payer: lender_pubkey,
        tree_id: localnet.tree_id,
    }
    .build(&lender.keypair)?
    .prove(client.indexer(), localnet.tree)?
    .instruction()?;
    let error = send(client.rpc(), &[&lender.keypair], early_claim_ix)
        .expect_err("a claim before the deadline must fail");
    let not_yet = LoanError::NotYetExpired as u32;
    assert!(
        format!("{error:#}").contains(&format!("custom program error: {not_yet:#x}")),
        "expected NotYetExpired: {error:#}"
    );

    // 4. After the deadline, the lender claims the collateral.
    let wait = deadline + 3
        - SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs();
    std::thread::sleep(Duration::from_secs(wait));
    let claim_transaction = ClaimTransactionParams {
        loan_utxo: loan_utxo.clone(),
        loan_leaf_index: loan_state.leaf_index,
        payer: lender_pubkey,
        tree_id: localnet.tree_id,
    }
    .build(&lender.keypair)?;
    let collateral_output_blinding = claim_transaction.collateral_output_blinding;
    let claim_ix = claim_transaction
        .prove(client.indexer(), localnet.tree)?
        .instruction()?;
    let claim_signature = send(client.rpc(), &[&lender.keypair], claim_ix)?;
    client
        .confirm_private_transaction_sync(claim_signature)
        .map_err(|e| anyhow!("confirm claim indexed: {e:?}"))?;

    // 5. The claimed collateral is indexed under the lender.
    let collateral_output = spr_transaction::SppProofOutputUtxo {
        asset: Mint::SOL,
        amount: COLLATERAL_AMOUNT,
        blinding: collateral_output_blinding,
        owner_address: Some(lender_address),
        ..Default::default()
    }
    .hash(localnet.tree_id)
    .map_err(|e| anyhow!("collateral output hash: {e:?}"))?;
    client
        .indexer()
        .get_merkle_proofs(localnet.tree, vec![collateral_output], None)
        .map_err(|e| anyhow!("claim output index: {e}"))?;
    Ok(())
}
