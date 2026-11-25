# DarkRings

**Private fixed-term lending on Solana Privacy Rings. Loans without a liquidation price.**

Live site and demo desk: [darkrings.app](https://darkrings.app)

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
spike/       Mainnet SPR SDK spike: register, deposit, private transfer, withdraw (TypeScript)
web/         The site and demo desk (Vite + React), live at darkrings.app
docs/        MECHANISM.md, the full protocol design
test-utils/  Localnet harness (surfpool validator + photon indexer + prover)
```

Status: the loan program is complete and verified locally. 75 tests green, including adversarial suites (wrong terms, early claim, late repay, replayed proofs) and three full-lifecycle runs on a local SPR stack, one of them exercising a real-clock default. The SPR foundation (shielded transfers end to end) is proven on mainnet with dust amounts. Devnet deployment of the loan program and a trusted setup ceremony are the next steps before real value.

## Building and testing

Toolchain pins matter; SPR tooling is young.

```
rustup toolchain install 1.98.1
# agave 4.4.1 for cargo build-sbf
cargo build-sbf --tools-version v1.54 --arch v0     # in loan/program
```

Circuits compile through the zolana CLI (`zolana zk compile --test --skip-wasm`). The localnet suite expects the surfpool + photon + prover stack from `test-utils`; `loan/test` contains the end-to-end scenarios (offer to discovery to origination to repayment, cancel, and claim-on-default).

The web app is a standard Vite project: `npm install && npm run dev` inside `web/`.

## Honest boundaries

Addresses stay visible in the default ring, so participation in DarkRings is public even while every figure is not. Deposits from and withdrawals to public accounts reveal themselves. The proving keys in this repo come from a development setup and must be replaced by a proper ceremony before the protocol custodies real value. The desk at darkrings.app currently runs on sample data; it exists to show the exact shape of the product the program already implements.

## Built on

[Solana Privacy Rings](https://helius.dev) by Helius: shielded UTXO pools with encrypted amounts and assets, Groth16 confidential transactions, view keys, and program-owned UTXOs that let a PDA act as a shielded counterparty.
