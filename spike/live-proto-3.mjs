/* Probe 3: the COMPLETE offer from pure TS/WASM on mainnet.
   build (wasm) -> encrypt outputs -> external data + marker -> SppProofInputs
   -> client.proveTransact -> encode transact -> loan instruction -> send. */
import { readFileSync } from "node:fs";
import {
  LocalKeys,
  NullifierKey,
  ShieldedAddress,
  SigningKey,
  ShieldedKeypair,
  Wallet,
  initializePoseidon,
  syncWallet,
} from "@heliuslabs/spr";
import { SprClient, SignedTeePolicy } from "@heliuslabs/spr/client";
import {
  Data,
  LocalShieldedKeys,
  ProofInputUtxo,
  SppProofInputs,
  Utxo,
  createExternalData,
  createProofOutput,
  encryptConfidentialTransfer,
  privateTxBlinding,
} from "@heliuslabs/spr/transaction";
import { encodeTransactInstructionData } from "@heliuslabs/spr/interface";
import { getNullifierPdaAccountsAsync } from "@heliuslabs/spr/instructions";
import { getTreeAddress } from "@heliuslabs/spr/addresses";
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createKeyPairSignerFromPrivateKeyBytes,
  createTransactionMessage,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionWithSigners,
} from "@solana/kit";
import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from "@solana-program/compute-budget";

const stage = (s) => console.log(`\n== ${s}`);
const K = process.env.HELIUS_API_KEY;
const LOAN_PROGRAM = "4j3MfrBtrhrLV4Lu7JpP5TqbAHbZY6AkLmMUaR3TZHfE";
const SEND = process.env.SEND === "1";

await initializePoseidon();
const wasm = await import("../loan/target/zk/loan-program/wasm-node/loan_program.js");
const client = new SprClient({
  solanaRpcUrl: `https://mainnet.helius-rpc.com/?api-key=${K}`,
  indexerUrl: `https://mainnet.helius-rpc.com/v1/spr?api-key=${K}`,
  proverUrl: `https://mainnet.helius-rpc.com/v1/spr?api-key=${K}`,
  proverTee: SignedTeePolicy.forNetwork("mainnet"),
  priorityFeeLamports: 60_000n,
});

stage("wallets");
const home = process.env.HOME;
const lenderSeed = readFileSync(`${home}/.config/darkrings/lender.seed`);
const borrowerSeed = readFileSync(`${home}/.config/darkrings/borrower.seed`);
const lender = ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(lenderSeed));
const borrower = ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(borrowerSeed));
const lenderSigner = await createKeyPairSignerFromPrivateKeyBytes(lenderSeed);
const wallet = new Wallet({ identity: lender.shieldedAddress() });
const keys = LocalKeys.fromKeypair(lender, client.proofService);
await syncWallet({ client, wallet, keys });
const note = wallet.utxos().find((u) => !u.spent && u.utxo.amount > 0n);
if (!note) throw new Error("no spendable lender note");
console.log("note:", String(note.utxo.amount), "leaf", String(note.outputContext.leafIndex));

stage("wasm build");
const now = BigInt(Math.floor(Date.now() / 1000));
const lenderSolana = lender.shieldedAddress().solanaAddress();
const enc = getAddressEncoder();
const [loanAuthority, loanAuthorityBump] = await getProgramDerivedAddress({
  programAddress: LOAN_PROGRAM,
  seeds: ["loan_authority", enc.encode(lenderSolana)],
});
const zeroNullPk = NullifierKey.fromSecret(new Uint8Array(31)).publicKey();
const offerOwnerAddr = ShieldedAddress.forPda({
  pda: enc.encode(loanAuthority),
  nullifierPublicKey: zeroNullPk,
  viewingPublicKey: borrower.shieldedAddress().viewingPublicKey,
});
const beDec = (b) => { let v = 0n; for (const x of b) v = (v << 8n) | BigInt(x); return v.toString(); };
const borrowerIdentity = borrower.shieldedAddress().signingPublicKey.ownerProofInputHash();
const PRINCIPAL = 2_000_000n <= note.utxo.amount ? 2_000_000n : note.utxo.amount;
const terms = {
  collateralAmount: 2_500_000n,
  repayAmount: 2_100_000n,
  deadline: now + 7n * 86_400n,
  expiry: now + 7_200n,
};
const wasmNote = {
  utxo: {
    owner: note.utxo.owner.toBytes(),
    asset: { asset: String(note.utxo.asset), assetId: 1n },
    amount: note.utxo.amount,
    blinding: note.utxo.blinding,
  },
  nullifierPubkey: lender.shieldedAddress().nullifierPublicKey,
  utxoHash: note.outputContext.hash,
  nullifier: note.nullifier,
  treeId: 0,
  leafIndex: note.outputContext.leafIndex,
};
const built = wasm.offerTransaction(
  {
    private: {
      txContext: { outputTreeId: 0 },
      source: wasmNote,
      principalAmount: PRINCIPAL,
      collateralMint: { asset: String(note.utxo.asset), assetId: 1n },
      ...terms,
      borrowerPkFe: Array.from(borrowerIdentity),
    },
    public: {
      lenderOwnerPkField: beDec(lender.shieldedAddress().signingPublicKey.ownerProofInputHash()),
      offerOwner: offerOwnerAddr.toBytes(),
    },
  },
  lender.shieldedAddress().toBytes(),
  lenderSolana,
);
const ft = built.finalizedTx;
console.log("built; outputs:", ft.outputUtxos.map((o) => String(o.amount)), "firstNullifier:", Buffer.from(ft.firstNullifier).toString("hex").slice(0, 12));

stage("TS conversion: inputs/outputs");
const tsInputs = ft.inputUtxos.map((u) =>
  new ProofInputUtxo({
    utxo: new Utxo({
      owner: note.utxo.owner, // same owner object; single-input case
      asset: note.utxo.asset,
      amount: u.utxo.amount,
      blinding: u.utxo.blinding,
    }),
    nullifierPublicKey: u.nullifierPubkey,
    nullifier: u.nullifier,
    treeId: u.treeId,
  }),
);
console.log("tsInputs ok:", tsInputs.length);

const tsOutputs = ft.outputUtxos.map((o) => {
  const addr = ShieldedAddress.fromBytes(o.ownerAddress);
  return createProofOutput({
    ownerAddress: addr,
    asset: note.utxo.asset,
    amount: o.amount,
    blinding: o.blinding,
    dataHash: o.dataHash,
    data: new Data(o.data?.records ?? []),
  });
});
console.log("tsOutputs ok:", tsOutputs.length);

stage("encrypt");
const [txKey] = await LocalShieldedKeys.fromKeypair(lender).transactionKeys([
  { viewingPublicKey: lender.shieldedAddress().viewingPublicKey, firstNullifier: ft.firstNullifier },
]);
const { AssetRegistry } = await import("@heliuslabs/spr/transaction");
const encrypted = encryptConfidentialTransfer(txKey, { outputs: tsOutputs, assets: new AssetRegistry() });
console.log("encrypted keys:", Object.keys(encrypted));
console.log("payload:", JSON.stringify(encrypted.payload, (k,v)=> typeof v==="bigint"?String(v): v instanceof Uint8Array?`u8[${v.length}]`:v, 1).slice(0,500));

stage("external data + marker");
const { InstructionTag } = await import("@heliuslabs/spr/interface");
const senderResolved = lender.shieldedAddress().confidentialViewTag();
// payer IS the lender, so the sender tag compresses to account index 0
const senderTag = { kind: "account", index: 0 };
const markerData = new Uint8Array(64);
markerData.set(ft.outputHashes[1], 0);
markerData.set(enc.encode(lenderSolana), 32);
const messages = [{ viewTag: borrower.shieldedAddress().confidentialViewTag(), data: markerData }];

const txOutputs = [];
const resolvedTags = [];
tsOutputs.forEach((output, index) => {
  const slot = encrypted.payload[index];
  const utxoHash = output.hash(ft.outputTreeId);
  if (index === 0) {
    // the change back to the sender
    txOutputs.push({ utxoHash, ownerTag: senderTag, data: slot.data });
    resolvedTags.push(senderResolved);
  } else {
    txOutputs.push({ utxoHash, ownerTag: { kind: "inline", value: slot.viewTag }, data: slot.data });
    resolvedTags.push(slot.viewTag);
  }
});
console.log("output hash check:",
  Buffer.from(txOutputs[0].utxoHash).toString("hex") === Buffer.from(ft.outputHashes[0]).toString("hex"),
  Buffer.from(txOutputs[1].utxoHash).toString("hex") === Buffer.from(ft.outputHashes[1]).toString("hex"));
console.log("resolved tag check:",
  resolvedTags.map((t, i) => Buffer.from(t).toString("hex") === Buffer.from(ft.ownerTags[i].resolved).toString("hex")));

const externalData = createExternalData({
  instructionDiscriminator: InstructionTag.transact,
  expiryUnixTs: terms.expiry,
  txViewingPublicKey: encrypted.txViewingPublicKey,
  salt: encrypted.salt,
  outputs: txOutputs,
  resolvedOwnerTags: resolvedTags,
  messages,
});
console.log("externalData ok");

stage("SppProofInputs + proveTransact");
const paddedInputs = [...tsInputs];
while (paddedInputs.length < 2) paddedInputs.push(ProofInputUtxo.dummy(undefined, 0));
const spp = new SppProofInputs({
  payer: ft.payer,
  inputUtxos: paddedInputs,
  outputs: tsOutputs,
  externalData,
  blindingSeed: ft.blindingSeed,
  outputTreeId: ft.outputTreeId,
});
const hashHex = (b) => Buffer.from(b).toString("hex");
console.log("privateTxHash TS:", hashHex(spp.privateTxHash()).slice(0, 16), "wasm:", hashHex(ft.paddingIndependentPrivateTxHash).slice(0, 16));
const transact = await client.proveTransact(spp, keys);
console.log("TRANSACT PROVED; keys:", Object.keys(transact));

stage("loan instruction");
const transactBytes = encodeTransactInstructionData(transact);
console.log("transact bytes:", transactBytes.length);

stage("circuit proof (wasm prover)");
const readArt = (f) => readFileSync(new URL(`../loan/target/zk/loan-program/offer/${f}`, import.meta.url));
const t0 = Date.now();
const bundle = wasm.prove(readArt("circuit.xbc"), readArt("pk.bin"), built.proofInputs);
console.log("circuit PROVED in", Date.now() - t0, "ms; bundle keys:", Object.getOwnPropertyNames(Object.getPrototypeOf(bundle)));
const proofBytes = wasm.compressedProgramProof(bundle.proof ?? bundle.toBytes?.() ?? bundle.bytes);
console.log("compressed proof bytes:", proofBytes.length);

stage("instruction assembly");
const bump = loanAuthorityBump;
const viewingPubkey = borrower.shieldedAddress().viewingPublicKey.toBytes();
console.log("viewing pubkey len:", viewingPubkey.length, "bump:", bump);
if (proofBytes.length !== 128) throw new Error(`proof not 128B: ${proofBytes.length}`);
const data = new Uint8Array(1 + 128 + viewingPubkey.length + 1 + transactBytes.length);
let off = 0;
data[off] = 0; off += 1;                        // tag::OFFER
data.set(proofBytes, off); off += 128;          // proof
data.set(viewingPubkey, off); off += viewingPubkey.length; // viewing_pubkey [u8;33]
data[off] = bump; off += 1;                     // authority_bump
data.set(transactBytes, off);                   // transact
console.log("ix data bytes:", data.length);

const { SHIELDED_POOL_PROGRAM_ID } = await import("@heliuslabs/spr");
const tree = await getTreeAddress(0);
console.log("transact input keys:", Object.keys(transact.inputs[0] ?? {}), "count:", transact.inputs.length);
const nullifiers = transact.inputs.map((i) => i.nullifierHash ?? i.nullifier);
const nullifierPdas = await getNullifierPdaAccountsAsync(tree, nullifiers);
console.log("tree:", tree, "nullifier PDAs:", nullifierPdas.length);

const accounts = [
  { address: lenderSolana, role: 3 },            // payer W+S
  { address: lenderSolana, role: 3 },
  { address: tree, role: 1 },                    // W
  { address: SHIELDED_POOL_PROGRAM_ID, role: 0 },
  { address: "11111111111111111111111111111111", role: 0 },
  { address: tree, role: 1 },
  ...nullifierPdas,
  { address: lenderSolana, role: 2 },            // RO+S
  { address: loanAuthority, role: 0 },           // RO
];
const ix = { programAddress: LOAN_PROGRAM, accounts, data };

if (!SEND) {
  console.log("DRY RUN COMPLETE (set SEND=1 to submit)");
} else {
  stage("send");
  const { compileUnsignedTransaction } = await import("./node_modules/@heliuslabs/spr/dist/flows/compile.js");
  const { value: blockhash } = await client.solanaRpc.getLatestBlockhash().send();
  const tx = compileUnsignedTransaction({
    feePayer: lenderSolana,
    lifetime: blockhash,
    instructions: [ix],
    computeUnitLimit: 1_400_000,
    priorityFeeLamports: 100_000n,
  });
  const signed = await signTransactionWithSigners([lenderSigner], tx);
  const wire = getBase64EncodedWireTransaction(signed);
  const sig = getSignatureFromTransaction(signed);
  const sim = await client.solanaRpc.simulateTransaction(wire, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true }).send().catch((e) => ({ simError: e }));
  console.log("SIMULATION:", JSON.stringify(sim?.value ?? sim, (k, v) => typeof v === "bigint" ? String(v) : v).slice(0, 900));
  const started = Date.now();
  let lastErr;
  let done = false;
  while (Date.now() - started < 90_000 && !done) {
    try { await client.solanaRpc.sendTransaction(wire, { encoding: "base64", skipPreflight: true, maxRetries: 0n }).send(); } catch (e) { lastErr = e; }
    const { value } = await client.solanaRpc.getSignatureStatuses([sig]).send();
    const st = value?.[0];
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      if (st.err) throw new Error(`on-chain error: ${JSON.stringify(st.err)} sig ${sig}`);
      console.log("OFFER LANDED FROM PURE TS:", `https://explorer.solana.com/tx/${sig}`);
      done = true;
    }
    if (!done) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!done) throw lastErr ?? new Error("never confirmed: " + sig);
}
