mod shared;

use std::time::Duration;

use anyhow::{anyhow, Result};
use shared::{send, setup, wait_for_merkle_proof, TestEnv, COLLATERAL_AMOUNT, PRINCIPAL_AMOUNT, REPAY_AMOUNT};
use spr_client::{user_registry::ensure_registered, Rpc};
use spr_transaction::{Mint, SppProofOutputUtxo};
use loan_sdk::{
    index::index_maker,
    instructions::{cancel::CancelTransactionParams, offer::OfferTransactionParams},
    state::OfferTerms,
};

// The committed order expiry is already in the past, so the lender can cancel
// immediately: the swap program requires `now > order_expiry`.
const EXPIRY: u64 = 1_000_000;

// Confidential swap cancel on the shielded pool -- make then cancel -- driven
// against the same localnet (validator + Photon indexer + prover) as swap.rs.
//
// Flow:
//   1. Fund (in setup): 1.0 SPL is shielded to the lender.
//   2. Make: as in swap.rs, but an open order (no designated borrower) whose
//      expiry is already in the past.
//   3. Discover: the lender rediscovers the order opening from the indexer
//      (`index_maker`), decrypting the order UTXO slot from the sender side.
//   4. Cancel: the lender spends the order UTXO (0.4 SPL) -> source output
//      0.4 SPL back to the lender.
//   5. Assert the returned source output is indexed.
//
// Net: lender 1.0 SPL -> 0.6 SPL change + 0.4 SPL returned; the borrower never acts.
#[test]
fn offer_and_cancel_inline() -> Result<()> {
    let TestEnv {
        localnet,
        lender,
        lender_input,
        borrower,
        spl_mint,
    } = setup(1)?;
    let client = &localnet.client;
    let maker_address = lender.keypair.shielded_address()?;
    let lender_pubkey = maker_address.solana_address()?;
    ensure_registered(client.rpc(), &lender.keypair, &lender.keypair)
        .map_err(|e| anyhow!("register lender: {e:?}"))?;

    // 1. Make an open order that has already expired.
    assert_eq!(lender_input.utxo.asset.asset, spl_mint);
    let terms = OfferTerms {
        collateral_mint: Mint::SOL,
        collateral_amount: COLLATERAL_AMOUNT,
        repay_amount: REPAY_AMOUNT,
        deadline: EXPIRY,
        lender: maker_address,
        expiry: EXPIRY,
        borrower: None,
    };
    let make_ix = OfferTransactionParams {
        terms,
        principal_amount: PRINCIPAL_AMOUNT,
        source: lender_input,
        borrower_address: borrower.keypair.shielded_address()?,
        payer: lender_pubkey,
    }
    .build(&lender.keypair)?
    .prove(client.indexer(), localnet.tree, &lender.keypair)?
    .instruction()?;
    let make_signature = send(client.rpc(), &[&lender.keypair], make_ix)?;
    client
        .confirm_private_transaction_sync(make_signature)
        .map_err(|e| anyhow!("confirm make indexed: {e:?}"))?;

    // 2. Rediscover the order from the lender's side.
    let order = index_maker(
        &lender.keypair,
        &lender.registry,
        client.indexer(),
        Duration::from_secs(60),
    )?
    .pop()
    .ok_or_else(|| anyhow!("no own swap order discovered"))?;
    assert_eq!(order.taker_viewing_pubkey, borrower.keypair.viewing_pubkey());
    let offer_utxo = order.offer_utxo;

    // 3. Cancel back to the lender.
    let order_state = wait_for_merkle_proof(
        client.indexer(),
        localnet.tree,
        offer_utxo.hash(localnet.tree_id)?,
    )?;
    let cancel_transaction = CancelTransactionParams {
        offer_utxo: offer_utxo.clone(),
        order_leaf_index: order_state.leaf_index,
        payer: lender_pubkey,
        tree_id: localnet.tree_id,
    }
    .build(&lender.keypair)?;
    let source_output_hash = SppProofOutputUtxo {
        asset: offer_utxo.principal_mint,
        amount: offer_utxo.principal_amount,
        blinding: cancel_transaction.source_output_blinding,
        owner_address: Some(maker_address),
        ..Default::default()
    }
    .hash(localnet.tree_id)
    .map_err(|e| anyhow!("source output hash: {e:?}"))?;
    let cancel_ix = cancel_transaction
        .prove(client.indexer(), localnet.tree)?
        .instruction()?;
    let cancel_signature = send(client.rpc(), &[&lender.keypair], cancel_ix)?;
    client
        .confirm_private_transaction_sync(cancel_signature)
        .map_err(|e| anyhow!("confirm cancel indexed: {e:?}"))?;

    // 4. The refund is indexed.
    client
        .indexer()
        .get_merkle_proofs(localnet.tree, vec![source_output_hash], None)
        .map_err(|e| anyhow!("cancel output index: {e}"))?;
    Ok(())
}
