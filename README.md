# DarkRings

**Private fixed-term lending on Solana Privacy Rings. Loans without a liquidation price.**

Live site and demo desk: [darkrings.app](https://darkrings.app)

**Live on mainnet.** Program [`4j3MfrBtrhrLV4Lu7JpP5TqbAHbZY6AkLmMUaR3TZHfE`](https://explorer.solana.com/address/4j3MfrBtrhrLV4Lu7JpP5TqbAHbZY6AkLmMUaR3TZHfE), and one full loan lifecycle settled with real SOL, every figure encrypted: [offer](https://explorer.solana.com/tx/3ssx9gJT5RYHCBDgqSWvQM3QKuEHHYXcbyvoQQRG8rZoJdjSgmqNgRrfKBEM6oWfZEAyGMayFKcUCUeXYAA2W6sG), [originate](https://explorer.solana.com/tx/4FY9asu1pZfppLKHtp7sr6Z3pG9VskzcrKcePSHBGfLKC4ofhRJkUufEGdMf57gfndXsJr4jbEbY2CP9KnBzMBwm), [repay](https://explorer.solana.com/tx/yrCDVMU1TkUQ4i6ECzzfGPjQSxGsLE1TMAJKgW36wfqPaq395aWgKCQcPdwFsiSRtHN2P2dNPiiAUSrTD9jFkvj).

## The idea

Every margin system publishes a map of its own weak points. Collateral, debt and the liquidation threshold sit in public accounts, so the exact price at which any position can be forced is computable by anyone, continuously. Encrypting those balances moves the attack surface; it does not remove it, because the protocol still has to evaluate a price feed against a ratio somewhere.

DarkRings takes the other branch. A loan here is fixed-term and overcollateralized: the borrower owes a known amount by a known time, and the only input settlement consults is the clock.

- No price feed participates in settlement, so there is nothing to manipulate.
- No liquidation threshold exists, encrypted or otherwise, so there is nothing to compute toward.
- A default resolves one loan between two parties, so there is nothing to cascade.

Amounts, assets, rates and deadlines live inside Solana Privacy Rings (SPR) shielded UTXOs: encrypted on-chain, legible only to the two counterparties through their view keys.

## How it works

Five instructions cover the whole lifecycle. Each one verifies a Groth16 proof and settles through a confidential SPR transaction.

| Instruction | Who | What happens |
|---|---|---|
| `offer` | Lender | Posts principal into a program-owned shielded UTXO together with encrypted terms (collateral mint and amount, repay amount, deadline, expiry) |
| `originate` | Borrower | Atomically swaps collateral against the offered principal; a loan-state UTXO is created. 2 inputs, 2 outputs, one transaction |
| `repay` | Borrower | Pays the repay amount to the lender and reclaims collateral, any time before the deadline |
| `claim` | Lender | After the deadline, takes the collateral. Default is a date, not a price |
| `cancel` | Lender | After offer expiry, withdraws an untaken offer |

What a block explorer sees for an origination, exhaustively: the loan program ran, two shielded inputs were spent, two commitments were created, a 128-byte proof verified, and which addresses signed. Not the amounts, not the ratio, not the rate, not the deadline.

## What is in this repo

```
loan/        The on-chain program and its circuits
  program/   Pinocchio program: 5 instructions, 5 Groth16 verifiers (Xark circuit DSL)
  sdk/       Rust client: terms encoding, proof generation, discovery via marker messages
  test/      Unit, adversarial and localnet end-to-end suites
  mainnet-run/  The binary that drove the mainnet lifecycle: fund, deposit, run, sweep
spike/       Mainnet SPR SDK spike: register, deposit, private transfer, withdraw (TypeScript)
web/         The site and demo desk (Vite + React), live at darkrings.app
docs/        MECHANISM.md, the full protocol design
test-utils/  Localnet harness (surfpool validator + photon indexer + prover)
```

Status: live on mainnet. 75 tests green, including adversarial suites (wrong terms, early claim, late repay, replayed proofs) and three full-lifecycle runs on a local SPR stack, one of them exercising a real-clock default; then the lifecycle above settled on mainnet with real SOL. The proving keys are a phase-2 setup over the Hermez Powers of Tau transcript and the deployed binary passes `zolana vks check` with no test setup found. A multi-party phase-2 ceremony and audits come before the protocol custodies meaningful value.

## Building and testing

Toolchain pins matter; SPR tooling is young.

```
rustup toolchain install 1.98.1
# agave 4.4.1 for cargo build-sbf
cargo build-sbf --tools-version v1.54 --arch v0 --features bpf-entrypoint   # in loan/program
```

Circuits compile through the zolana CLI (`zolana zk compile -p loan-program --skip-wasm`), which picks up the Powers-of-Tau transcript from `loan/program/ptau/` for the key setup; `loan/loan-keys.CHECKSUM` pins the artifacts. The localnet suite expects the surfpool + photon + prover stack from `test-utils`; `loan/test` contains the end-to-end scenarios (offer to discovery to origination to repayment, cancel, and claim-on-default).

The web app is a standard Vite project: `npm install && npm run dev` inside `web/`.

## Honest boundaries

Addresses stay visible in the default ring, so participation in DarkRings is public even while every figure is not. Deposits from and withdrawals to public accounts reveal themselves. The proving keys build on the public Hermez Powers of Tau phase-1 ceremony with a single-party phase-2 contribution whose randomness the toolchain discards; a multi-party phase-2 ceremony replaces them before the protocol custodies meaningful value. The desk at darkrings.app currently runs on sample data; it exists to show the exact shape of the product the program already implements on mainnet.

## Built on

[Solana Privacy Rings](https://helius.dev) by Helius: shielded UTXO pools with encrypted amounts and assets, Groth16 confidential transactions, view keys, and program-owned UTXOs that let a PDA act as a shielded counterparty.
