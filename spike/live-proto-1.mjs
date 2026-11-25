/* Live-desk prototype, probe 1: wasm offerTransaction from a real synced
   wallet. Reads the mainnet runner's lender seed, syncs its shielded wallet
   through the TS SDK, maps one spendable note into the wasm's WalletUtxo
   shape, builds the offer transaction, and dumps the result. No sending. */
import { readFileSync } from "node:fs";
import {
  LocalKeys,
  ShieldedKeypair,
  SigningKey,
  SOL_MINT,
  Wallet,
  formatAmount,
  initializePoseidon,
  syncWallet,
} from "@heliuslabs/spr";
import { SprClient, SignedTeePolicy } from "@heliuslabs/spr/client";

const API_KEY = process.env.HELIUS_API_KEY;
if (!API_KEY) throw new Error("HELIUS_API_KEY missing");
const INDEXER = `https://mainnet.helius-rpc.com/v1/spr?api-key=${API_KEY}`;

await initializePoseidon();
const wasm = await import("../loan/target/zk/loan-program/wasm-node/loan_program.js");

const client = new SprClient({
  solanaRpcUrl: `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`,
  indexerUrl: INDEXER,
  proverUrl: INDEXER,
  proverTee: SignedTeePolicy.forNetwork("mainnet"),
  priorityFeeLamports: 60_000n,
});

const seed = readFileSync(`${process.env.HOME}/.config/darkrings/lender.seed`);
const keypair = ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(seed));
const wallet = new Wallet({ identity: keypair.shieldedAddress() });
const keys = LocalKeys.fromKeypair(keypair, client.proofService);
await syncWallet({ client, wallet, keys });
const balance = wallet.balance(SOL_MINT);
console.log("lender shielded:", formatAmount(balance.amount, 9), "SOL in", balance.utxos?.length ?? "?", "utxos");

const dump = (o, d = 0) =>
  JSON.stringify(
    o,
    (k, v) =>
      typeof v === "bigint"
        ? `${v}n`
        : v instanceof Uint8Array
          ? `u8[${v.length}]:${Buffer.from(v).toString("hex").slice(0, 16)}…`
          : v,
    2,
  );

// What does a wallet utxo look like on the TS side?
const note = balance.utxos?.[0] ?? wallet.utxos?.(SOL_MINT)?.[0];
console.log("TS note:", dump(note));
console.log("wallet keys:", Object.keys(wallet));
console.log("note keys:", note ? Object.keys(note) : "none");
