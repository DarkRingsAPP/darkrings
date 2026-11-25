/* Probe 4: borrower-side discovery + ORIGINATE from pure TS/WASM on mainnet.
   Finds the live offer by the borrower's marker tag, decrypts the terms,
   builds the originate in wasm, proves both sides, sends. SEND=1 to submit. */
import { readFileSync } from "node:fs";
import {
  makeCtx,
  makeActor,
  sync,
  wasmNote,
  beDec,
  zeroNullifierKey,
  settleAuthority,
  finalizeSpp,
  paddedInputs,
  circuitProof,
  loanInstruction,
  sendInstruction,
  waitForLeaf,
  Data,
  ProofInputUtxo,
  SppProofInputs,
  Utxo,
  createProofOutput,
  decodeConfidential,
  ShieldedAddress,
  enc,
  TAG,
} from "./live-lib.mjs";
import { ShieldedPublicKey, NullifierKey } from "@heliuslabs/spr";
import { decodeOutputData } from "@heliuslabs/spr/transaction";
import { splitEmbeddedKey } from "./node_modules/@heliuslabs/spr/dist/transaction/serialization/codecs.js";
import { zeroKeyNullifier } from "./node_modules/@heliuslabs/spr/dist/keypair/nullifier-key.js";

const stage = (s) => console.log(`\n== ${s}`);
const SEND = process.env.SEND === "1";
const hex = (b) => Buffer.from(b).toString("hex");

const ctx = await makeCtx();
const home = process.env.HOME;
const lender = await makeActor(ctx, readFileSync(`${home}/.config/darkrings/lender.seed`));
const borrower = await makeActor(ctx, readFileSync(`${home}/.config/darkrings/borrower.seed`));

stage("discovery: scan the borrower's marker tag");
const tag = borrower.keypair.shieldedAddress().confidentialViewTag();
const found = await ctx.client.getShieldedTransactionsByTags({ tags: [tag] });
console.log("response keys:", Object.keys(found));
const txs = found.data ?? found.transactions ?? [];
console.log("tagged txs:", txs.length);
const dump = (o) =>
  JSON.stringify(o, (k, v) => (typeof v === "bigint" ? String(v) : v instanceof Uint8Array ? `u8[${v.length}]:${hex(v).slice(0, 12)}` : v), 1);
if (txs.length === 0) throw new Error("no tagged transactions found");
const markerTxs = txs
  .filter((t) => t.events?.some((e) => e.messages?.length > 0))
  .sort((a, b) => Number(b.slot) - Number(a.slot));
if (markerTxs.length === 0) throw new Error("no marker transaction found");
const markerTx = markerTxs[0];
console.log("marker txs:", markerTxs.map((t) => `${t.signature.slice(0, 8)}@${t.slot}`));
console.log("using:", markerTx.signature);

stage("fetch + decrypt the offer");
const full = await ctx.client.getShieldedTransactionsBySignature(markerTx.signature);
const entries = full.transactions ?? full.data ?? [];
const event = entries.map((d) => d?.transaction ?? d).find((e) => e?.messages?.length > 0);
if (!event) throw new Error("offer transaction has no marker event");
const marker = event.messages[0];
const offerHash = marker.data.slice(0, 32);
const lenderPubkeyBytes = marker.data.slice(32, 64);
const offerSlotIndex = event.outputSlots.findIndex((s) => hex(s.outputContext.hash) === hex(offerHash));
const offerSlot = event.outputSlots[offerSlotIndex];
console.log("offer slot index:", offerSlotIndex, "leaf:", offerSlot.outputContext.leafIndex);
// sanity: the lender decrypts its own change slot with the same machinery
try {
  const f0 = decodeOutputData(event.outputSlots[0].payload);
  const p0 = lender.keypair.decryptUtxo(splitEmbeddedKey(f0.body).rest, event.txViewingPublicKey, event.salt, 0);
  console.log("lender change decode:", dump(decodeConfidential(p0)).slice(0, 220));
} catch (e) {
  console.log("lender change decrypt FAILED:", e.message, e.details ?? "");
}
const frame = decodeOutputData(offerSlot.payload);
console.log("frame scheme:", frame.scheme, "encoding:", frame.encoding, "body:", frame.body?.length ?? frame.bytes?.length);
const plaintext = borrower.keypair.decryptUtxo(splitEmbeddedKey(frame.body).rest, event.txViewingPublicKey, event.salt, offerSlotIndex);
console.log("decrypted bytes:", plaintext.length);
const confidential = decodeConfidential(plaintext);
console.log("confidential:", dump(confidential).slice(0, 300));
console.log("data records:", confidential.data?.records?.().map((r) => [r.kind, r.bytes?.length]));

stage("reconstruct the offer utxo + decode terms");
const lenderSolanaFromMarker = lenderPubkeyBytes;
const { getProgramDerivedAddress, getAddressDecoder } = await import("@solana/kit");
const lenderAddrB58 = getAddressDecoder().decode(lenderSolanaFromMarker);
const [lenderAuthority, lenderAuthorityBump] = await getProgramDerivedAddress({
  programAddress: "4j3MfrBtrhrLV4Lu7JpP5TqbAHbZY6AkLmMUaR3TZHfE",
  seeds: ["loan_authority", lenderSolanaFromMarker],
});
console.log("lender:", lenderAddrB58, "authority:", lenderAuthority, "bump:", lenderAuthorityBump);
const pdaOwner = ShieldedPublicKey.fromPda(enc.encode(lenderAuthority));
const offerUtxoHash = offerSlot.outputContext.hash;
const offerWalletUtxo = {
  utxo: {
    owner: pdaOwner.toBytes(),
    asset: { asset: "11111111111111111111111111111111", assetId: 1n },
    amount: confidential.amount,
    blinding: confidential.blinding,
    data: { records: confidential.data?.records?.().map((r) => ({ kind: r.kind, bytes: r.bytes })) ?? [] },
  },
  nullifierPubkey: zeroNullifierKey().publicKey(),
  utxoHash: offerUtxoHash,
  nullifier: zeroKeyNullifier(offerUtxoHash, confidential.blinding),
  treeId: 0,
  leafIndex: offerSlot.outputContext.leafIndex,
};
const dataUtxo = ctx.wasm.offerTermsDataUtxo(offerWalletUtxo);
console.log("dataUtxo keys:", Object.keys(dataUtxo));
const terms = dataUtxo.data;
console.log("terms keys:", Object.keys(terms));
console.log("terms deadline/expiry:", String(terms.deadline), String(terms.expiry), "repay:", String(terms.repayAmount));
console.log("terms.lender:", dump(terms.lender).slice(0, 260), "borrowerPkFe len:", terms.borrowerPkFe?.length);

stage("resolve the lender's registered address");
const records = await ctx.client.getUserRecords([lenderAddrB58]);
console.log("records keys:", Object.keys(records));
const rec = records.records?.[0] ?? records.data?.[0] ?? [...(records.values?.() ?? [])][0];
console.log("record:", dump(rec).slice(0, 400));

const { toTsInput, toTsOutput } = await import("./live-lib.mjs");
const SEND1 = process.env.SEND === "1";

stage("originate build (wasm)");
const borrowerNotes = await sync(ctx, borrower);
const collateralNote = borrowerNotes.find((u) => u.utxo.amount === terms.collateralAmount);
if (!collateralNote) throw new Error(`no exact collateral note of ${terms.collateralAmount}`);
console.log("collateral note leaf:", String(collateralNote.outputContext.leafIndex));
const offerNote = { ...offerWalletUtxo, ...(dataUtxo.utxo.dataHash ? { dataHash: dataUtxo.utxo.dataHash } : {}) };
console.log("offer dataHash:", dataUtxo.utxo.dataHash ? hex(dataUtxo.utxo.dataHash).slice(0, 12) : "NONE");
const loanOwnerAddr = ShieldedAddress.forPda({
  pda: enc.encode(lenderAuthority),
  nullifierPublicKey: zeroNullifierKey().publicKey(),
  viewingPublicKey: rec.viewingPublicKey,
});
const DROR = 1146244946; // u32 BE "DROR" = 0x44524F52
const leDec = (b) => { let v = 0n; for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]); return v.toString(); };
const { poseidon: sdkPoseidon, bytesField } = await import("./node_modules/@heliuslabs/spr/dist/client/internal.js");
console.log("blinding match:", hex(dataUtxo.utxo.utxo.blinding) === hex(confidential.blinding));
const bigToBE32 = (v0) => { let v = v0; const out = new Uint8Array(32); for (let i = 31; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; } return out; };
const bigToLE32 = (v0) => { let v = v0; const out = new Uint8Array(32); for (let i = 0; i < 32; i++) { out[i] = Number(v & 0xffn); v >>= 8n; } return out; };
const sdkSeed = sdkPoseidon([BigInt(DROR), bytesField(confidential.blinding, "b")]);
const wasmSeed = BigInt(ctx.wasm.poseidon2([String(DROR), beDec(confidential.blinding)]));
console.log("OFFER_BLINDING_HEX:", hex(confidential.blinding));
const oracleHex = process.env.ORACLE_SEED;
const seedVariants = [
  ["wasm-export", new Uint8Array(ctx.wasm.blindingSeed(DROR, confidential.blinding))],
  ...(oracleHex ? [["rust-oracle", Uint8Array.from(Buffer.from(oracleHex, "hex"))]] : []),
  ["sdk-BE", bigToBE32(sdkSeed)], ["sdk-LE", bigToLE32(sdkSeed)],
  ["wasm-BE", bigToBE32(wasmSeed)], ["wasm-LE", bigToLE32(wasmSeed)],
];
let builtO;
for (const [variantName, originateSeed] of seedVariants) {
try {
builtO = ctx.wasm.originateTransaction(
  {
    private: {
      txContext: { outputTreeId: 0, blindingSeed: originateSeed },
      terms: { ...terms, collateralMint: { asset: "11111111111111111111111111111111", assetId: 1n } },
      offerUtxo: dataUtxo.utxo,
      collateralIn: wasmNote(borrower, collateralNote),
    },
    public: {
      expiry: terms.expiry,
      firstNullifier: beDec(offerNote.nullifier),
      loanOwner: loanOwnerAddr.toBytes(),
    },
  },
  borrower.keypair.shieldedAddress().toBytes(),
  borrower.solana,
);
console.log("SEED VARIANT OK:", variantName);
break;
} catch (e) {
  console.log("variant", variantName, "failed:", e?.message?.slice(0, 60));
}
}
if (!builtO) throw new Error("no seed variant worked");
const ftO = builtO.finalizedTx;
console.log("originate built; outputs:", ftO.outputUtxos.map((o) => String(o.amount)), "inputs:", ftO.inputUtxos.length);

stage("SPP prove (settle authority)");
const tsInputsO = ftO.inputUtxos.map(toTsInput);
const tsOutputsO = ftO.outputUtxos.map(toTsOutput);
const { externalData: extO } = await finalizeSpp(ctx, ftO, tsOutputsO, borrower.keypair, {
  expiryUnixTs: terms.expiry,
  senderOutputCount: 1,
});
const sppO = new SppProofInputs({
  payer: ftO.payer,
  inputUtxos: paddedInputs(tsInputsO, 2),
  outputs: tsOutputsO,
  externalData: extO,
  blindingSeed: ftO.blindingSeed,
  outputTreeId: ftO.outputTreeId,
});
console.log("hash check:", hex(sppO.privateTxHash()).slice(0, 16), "wasm:", hex(ftO.paddingIndependentPrivateTxHash).slice(0, 16));
const transactO = await ctx.client.proveTransact(sppO, settleAuthority(ctx, borrower.keypair));
console.log("ORIGINATE TRANSACT PROVED");

stage("circuit proof + instruction");
const proofO = circuitProof(ctx, "originate", builtO.proofInputs);
const viewingLender = rec.viewingPublicKey.toBytes();
console.log("lender viewing len:", viewingLender.length);
const ixO = await loanInstruction(ctx, {
  tag: TAG.ORIGINATE,
  body: [proofO, lenderSolanaFromMarker, viewingLender, new Uint8Array([lenderAuthorityBump])],
  transact: transactO,
  payer: borrower.solana,
  owners: [
    { address: lenderAuthority, signer: false },
    { address: borrower.solana, signer: true },
  ],
});
if (!SEND1) {
  console.log("ORIGINATE DRY RUN COMPLETE (SEND=1 to submit)");
} else {
  const sig = await sendInstruction(ctx, ixO, borrower.signer);
  console.log("ORIGINATE LANDED FROM PURE TS:", `https://explorer.solana.com/tx/${sig}`);
}
