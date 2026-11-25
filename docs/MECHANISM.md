# DarkRings — Mechanism

Private P2P lending on Solana Privacy Rings. Fixed-term, fixed-rate,
overcollateralized loans where amounts, collateral and positions are encrypted
on-chain. There is no liquidation price to hunt, because there is no
liquidation price at all.

## Why no one can hunt you

Every lending venue today publishes collateral, debt and liquidation levels per
wallet. DarkRings loans are fixed-term: the only condition is a deadline.
Amounts live inside Solana Privacy Rings UTXOs (encrypted); the only public
facts are that *some* loan was originated, repaid or defaulted, and by which
addresses. Nothing about size, ratio or price exists on-chain in cleartext, so
liquidation hunting has nothing to aim at.

## The loan program (SPP ZK program)

An SPP ZK program, exactly like the official `timelock-escrow` and `swap`
examples: it verifies a small Groth16 proof of its own loan rules and CPIs the
Solana Privacy Program's `transact` for the confidential moves. It stores no
state and owns no accounts; loans live as UTXOs owned by a program PDA, terms
committed in `utxo_data`.

The design is a hybrid of the two official examples:

- from **swap**: atomic two-party settlement (2-in/2-out transact), designated
  counterparty, expiry, and the encrypted marker-message discovery flow
  (how borrower and lender find each other's UTXOs);
- from **timelock-escrow**: PDA custody of a data-bearing UTXO with committed
  terms, and the Clock-sysvar deadline check.

### Terms (committed in the loan UTXO)

```text
loan_terms = (
    lender_owner_hash,     // receives repayment, claims on default
    borrower_owner_hash,   // receives principal, reclaims collateral on repay
    principal_asset_id, principal_amount,
    collateral_asset_id, collateral_amount,
    repay_amount,          // principal + fixed interest
    deadline,              // unix seconds
)
```

### Instructions

1. **offer** (lender): locks the principal UTXO under the loan PDA with the
   terms, encrypted to the borrower's viewing key, marker message tagged to the
   borrower (open offers: tagged to a public market tag). Like swap `make`.
2. **originate** (borrower, before offer expiry): atomic 2-in/2-out —
   borrower's collateral UTXO → loan PDA (collateral UTXO with terms), locked
   principal → borrower. Like swap `take`. From this moment the loan exists;
   both legs settle in ONE Solana transaction (true DvP, no half-funded state).
3. **repay** (borrower, `now ≤ deadline`): atomic 2-in/2-out —
   `repay_amount` from borrower → lender_owner_hash, collateral UTXO →
   borrower_owner_hash. The circuit pins amounts and destinations to the
   committed terms; the program checks the Clock.
4. **claim** (lender, `now > deadline`): 1-in/1-out — collateral UTXO →
   lender_owner_hash. Like timelock `withdraw`. Default is just an expiry.
5. **cancel** (lender, offer expired untaken): reclaim the principal UTXO.

### Privacy model

- Public: which instruction ran, asset_ids, the participating Solana signer
  addresses (default ring), UTXO hashes and ciphertexts, the deadline at
  repay/claim time.
- Private: principal, collateral, repay amounts; collateral ratio; every
  balance; aggregate volumes.
- Unlinkable: SPP hides which earlier UTXO a spend consumes.

## Market structure

Isolated P2P fixed-term markets (Morpho-Blue-shaped): each market is
(collateral asset, principal asset, term, rate band), offers listed as
encrypted order cards. No pool, no utilization curve, no shared-risk
socialization. Pooled markets are the roadmap once Custom Rings auditor keys
allow aggregate attestation.

## What the keeper does

Nothing custodial. A watcher (per user, in-browser or our hosted notifier)
syncs wallets via viewing keys, warns borrowers before deadlines, and can
auto-build the repay transaction for signing. The DEFAULT claim is the
lender's own transaction. The platform holds no funds at any point.

## Fees

An application-fee leg in `originate` (multi-transfer supports a payment +
fee leg natively in the SDK), flat bps on principal, paid privately to the
platform's shielded address. Non-custodial throughout.

## Verified foundations (spike, 2026-11-25)

- Mainnet E2E green: register → deposit → private transfer → encrypted balance
  reads via viewing keys → withdraw (darkrings/spike/e2e.mjs, total cost
  ~0.003 SOL). See memory/project_darkrings.md for the SDK gotchas.
- `ShieldedAddress.forPda` exists in the SDK: PDAs hold shielded balances.
- Official examples (vendor/privacy-ring-examples): timelock-escrow + swap
  specs and Xark (Rust circuit) implementations, program ~62 lines + sdk ~260
  lines, circuits 3-8k constraints, proofs 128 bytes, in-process proving,
  benchmarked. Insecure TEST keys — production needs a key ceremony.

## Open verification items

1. Does mainnet SPP v1.0.0 accept third-party ZK-program CPIs today, or is
   the ZK-program interface localnet/devnet-first? (Hackathon fallback: devnet
   deploy; the spec documents the interface as part of SPP.)
2. Xark toolchain build on this machine (Rust; zolana localnet needs a source
   build — heavy; CI or a cloud box is the alternative).
3. Client-side TransactIxData construction for custom shapes (the examples'
   test crates show it in Rust; we need it from TS or a small Rust sidecar).

## Status

- Go/no-go #1 (base flow, mainnet): PASSED
- Go/no-go #3 (viewing-key reads): PASSED
- Go/no-go #2 (custom release conditions): ARCHITECTURE CONFIRMED from the
  official examples; implementation is engineering, not research.
