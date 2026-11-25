/* Probe 2: map a synced TS note into the wasm WalletUtxo shape and build the
   offer transaction entirely in wasm. Dumps the ProgramTransaction. */
import { readFileSync } from "node:fs";
import {
  LocalKeys,
  ShieldedKeypair,
  SigningKey,
  SOL_MINT,
  Wallet,
  initializePoseidon,
  syncWallet,
} from "@heliuslabs/spr";
import { SprClient, SignedTeePolicy } from "@heliuslabs/spr/client";
import { NullifierKey, ShieldedAddress } from "@heliuslabs/spr";
import { getProgramDerivedAddress, getAddressEncoder } from "@solana/kit";

const K = process.env.HELIUS_API_KEY;
await initializePoseidon();
const wasm = await import("../loan/target/zk/loan-program/wasm-node/loan_program.js");

const client = new SprClient({
  solanaRpcUrl: `https://mainnet.helius-rpc.com/?api-key=${K}`,
  indexerUrl: `https://mainnet.helius-rpc.com/v1/spr?api-key=${K}`,
  proverUrl: `https://mainnet.helius-rpc.com/v1/spr?api-key=${K}`,
  proverTee: SignedTeePolicy.forNetwork("mainnet"),
  priorityFeeLamports: 60_000n,
});

const home = process.env.HOME;
const lenderSeed = readFileSync(`${home}/.config/darkrings/lender.seed`);
const borrowerSeed = readFileSync(`${home}/.config/darkrings/borrower.seed`);
const lender = ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(lenderSeed));
const borrower = ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(borrowerSeed));
const wallet = new Wallet({ identity: lender.shieldedAddress() });
const keys = LocalKeys.fromKeypair(lender, client.proofService);
await syncWallet({ client, wallet, keys });

const notes = wallet.utxos().filter((u) => !u.spent);
console.log(
  "spendable:",
  notes.map((u) => `${u.utxo.amount} (hash ${Buffer.from(u.outputContext.hash).toString("hex").slice(0, 8)}…)`),
);
const note = notes.find((u) => u.utxo.amount > 0n);
if (!note) throw new Error("no spendable note");

/* ---- map the TS note into the wasm WalletUtxo shape ---- */
const ownerBytes = (o) =>
  o?.toBytes?.() ?? o?.bytes ?? (o instanceof Uint8Array ? o : null);

const wasmNote = {
  utxo: {
    owner: note.utxo.owner.toBytes(),
    asset: { asset: String(note.utxo.asset), assetId: 1n },
    amount: note.utxo.amount,
    blinding: note.utxo.blinding,
  },
  nullifierPubkey: lender.shieldedAddress().nullifierPublicKey ?? new Uint8Array(32),
  utxoHash: note.outputContext.hash,
  nullifier: note.nullifier,
  treeId: 0,
  leafIndex: note.outputContext.leafIndex,
};
console.log("owner bytes len:", wasmNote.utxo.owner?.length);
console.log("nullifierPubkey:", wasmNote.nullifierPubkey?.length ?? wasmNote.nullifierPubkey);

const now = BigInt(Math.floor(Date.now() / 1000));
const LOAN_PROGRAM = "4j3MfrBtrhrLV4Lu7JpP5TqbAHbZY6AkLmMUaR3TZHfE";
const lenderSolana = lender.shieldedAddress().solanaAddress();
const [loanAuthority] = await getProgramDerivedAddress({
  programAddress: LOAN_PROGRAM,
  seeds: ["loan_authority", getAddressEncoder().encode(lenderSolana)],
});
console.log("loan authority PDA:", loanAuthority);
const zeroNullPk = NullifierKey.fromSecret(new Uint8Array(31)).publicKey();
const offerOwnerAddr = ShieldedAddress.forPda({
  pda: getAddressEncoder().encode(loanAuthority),
  nullifierPublicKey: zeroNullPk,
  viewingPublicKey: borrower.shieldedAddress().viewingPublicKey,
});
const beDec = (bytes) => { let v = 0n; for (const b of bytes) v = (v << 8n) | BigInt(b); return v.toString(); };
const borrowerIdentity = borrower.shieldedAddress().signingPublicKey.ownerProofInputHash();
const lenderOwnerPkField = beDec(lender.shieldedAddress().signingPublicKey.ownerProofInputHash());

const offerInputs = {
  private: {
    txContext: { outputTreeId: 0 },
    source: wasmNote,
    principalAmount: 2_000_000n > note.utxo.amount ? note.utxo.amount : 2_000_000n,
    collateralMint: { asset: String(note.utxo.asset), assetId: 1n },
    collateralAmount: 2_500_000n,
    repayAmount: 2_100_000n,
    deadline: now + 7n * 86_400n,
    expiry: now + 7_200n,
    borrowerPkFe: Array.from(borrowerIdentity),
  },
  public: {
    lenderOwnerPkField,
    offerOwner: offerOwnerAddr.toBytes(),
  },
};

try {
  console.log("addr bytes len:", lender.shieldedAddress().toBytes().length);
  const tx = wasm.offerTransaction(offerInputs, lender.shieldedAddress().toBytes(), "4AK75kjWrzDT73okgEkkQcRCFALwmpzMbJXNJ4TmhZKh");
  const dumpv = (o) => JSON.stringify(o, (k, v) => typeof v === "bigint" ? `${v}n` : v instanceof Uint8Array ? `u8[${v.length}]` : v, 1);
  const ft = tx.finalizedTx;
  for (const k of Object.keys(ft)) {
    const v = ft[k];
    const s = dumpv(v);
    console.log(`finalizedTx.${k}:`, s.length > 500 ? s.slice(0, 500) + "…" : s);
  }
  console.log("publicHash:", Buffer.from(tx.publicHash).toString("hex"));
} catch (e) {
  console.log("offerTransaction error:", e?.message ?? e);
}
