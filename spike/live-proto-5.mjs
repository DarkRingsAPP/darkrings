/* Probe 5: the WHOLE cycle from the TS stack on mainnet, one process:
   offer -> discover -> originate -> repay. State the desk would keep locally
   (the loan utxo) is kept here the same way. SEND=1 submits every leg. */
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
  toTsInput,
  toTsOutput,
  Data,
  ProofInputUtxo,
  SppProofInputs,
  ShieldedAddress,
  enc,
  TAG,
} from "./live-lib.mjs";
import { ShieldedPublicKey } from "@heliuslabs/spr";
import { zeroKeyNullifier } from "./node_modules/@heliuslabs/spr/dist/keypair/nullifier-key.js";
import { poseidon as sdkPoseidon, bytesField } from "./node_modules/@heliuslabs/spr/dist/client/internal.js";

const stage = (s) => console.log(`\n== ${s}`);
const SEND = process.env.SEND === "1";
const hex = (b) => Buffer.from(b).toString("hex");
const DROR = Buffer.from("DROR").readUInt32BE(0);
const DRRP = Buffer.from("DRRP").readUInt32BE(0);
console.log("domains:", DROR, DRRP);
const bigToBE32 = (v0) => { let v = v0; const out = new Uint8Array(32); for (let i = 31; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; } return out; };
const seedFor = (domain, blinding) => bigToBE32(sdkPoseidon([BigInt(domain), bytesField(blinding, "blinding")]));

const ctx = await makeCtx();
const home = process.env.HOME;
const lender = await makeActor(ctx, readFileSync(`${home}/.config/darkrings/lender.seed`));
const borrower = await makeActor(ctx, readFileSync(`${home}/.config/darkrings/borrower.seed`));
const PRINCIPAL = 2_000_000n;
const COLLATERAL = 2_500_000n;
const REPAY = 2_100_000n;
const now = BigInt(Math.floor(Date.now() / 1000));

/* ----------------------------- 1. OFFER (lender) ---------------------------- */
stage("OFFER");
const lenderNotes = await sync(ctx, lender);
const source = lenderNotes.find((u) => u.utxo.amount >= PRINCIPAL);
if (!source) throw new Error("no lender source note");
const borrowerIdentity = borrower.keypair.shieldedAddress().signingPublicKey.ownerProofInputHash();
const offerOwnerAddr = ShieldedAddress.forPda({
  pda: enc.encode(lender.authority),
  nullifierPublicKey: zeroNullifierKey().publicKey(),
  viewingPublicKey: borrower.keypair.shieldedAddress().viewingPublicKey,
});
const offerTerms = {
  collateralMint: { asset: "11111111111111111111111111111111", assetId: 1n },
  collateralAmount: COLLATERAL,
  repayAmount: REPAY,
  deadline: now + 7n * 86_400n,
  expiry: now + 2n * 3600n,
};
const builtOffer = ctx.wasm.offerTransaction(
  {
    private: {
      txContext: { outputTreeId: 0 },
      source: wasmNote(lender, source),
      principalAmount: PRINCIPAL,
      ...offerTerms,
      borrowerPkFe: Array.from(borrowerIdentity),
    },
    public: {
      lenderOwnerPkField: beDec(lender.keypair.shieldedAddress().signingPublicKey.ownerProofInputHash()),
      offerOwner: offerOwnerAddr.toBytes(),
    },
  },
  lender.keypair.shieldedAddress().toBytes(),
  lender.solana,
);
const ftOffer = builtOffer.finalizedTx;
const offerHash = ftOffer.outputHashes[1];
const offerBlinding = ftOffer.outputUtxos[1].blinding;
const markerData = new Uint8Array(64);
markerData.set(offerHash, 0);
markerData.set(enc.encode(lender.solana), 32);
const offerOutputs = ftOffer.outputUtxos.map(toTsOutput);
const { externalData: offerExt } = await finalizeSpp(ctx, ftOffer, offerOutputs, lender.keypair, {
  expiryUnixTs: offerTerms.expiry,
  senderOutputCount: 1,
  messages: [{ viewTag: borrower.keypair.shieldedAddress().confidentialViewTag(), data: markerData }],
});
const offerSpp = new SppProofInputs({
  payer: ftOffer.payer,
  inputUtxos: paddedInputs(ftOffer.inputUtxos.map(toTsInput), 2),
  outputs: offerOutputs,
  externalData: offerExt,
  blindingSeed: ftOffer.blindingSeed,
  outputTreeId: ftOffer.outputTreeId,
});
const offerTransact = await ctx.client.proveTransact(offerSpp, settleAuthority(ctx, lender.keypair));
const offerProof = circuitProof(ctx, "offer", builtOffer.proofInputs);
const offerIx = await loanInstruction(ctx, {
  tag: TAG.OFFER,
  body: [offerProof, borrower.keypair.shieldedAddress().viewingPublicKey.toBytes(), new Uint8Array([lender.authorityBump])],
  transact: offerTransact,
  payer: lender.solana,
  owners: [
    { address: lender.solana, signer: true },
    { address: lender.authority, signer: false },
  ],
});
if (!SEND) {
  console.log("offer dry-run ok; stopping (SEND=1 for the full cycle)");
  process.exit(0);
}
const offerSig = await sendInstruction(ctx, offerIx, lender.signer);
console.log("OFFER   ", `https://explorer.solana.com/tx/${offerSig}`);
await waitForLeaf(ctx, offerHash);

/* --------------------- 2. ORIGINATE (borrower, from state) ------------------ */
stage("ORIGINATE");
const borrowerNotes = await sync(ctx, borrower);
const collateralNote = borrowerNotes.find((u) => u.utxo.amount === COLLATERAL);
if (!collateralNote) throw new Error("no exact collateral note");
const offerLeaf = await waitForLeaf(ctx, offerHash);
const offerWalletUtxo = {
  utxo: {
    owner: ShieldedAddress.fromBytes(ftOffer.outputUtxos[1].ownerAddress).signingPublicKey.toBytes(),
    asset: { asset: "11111111111111111111111111111111", assetId: 1n },
    amount: PRINCIPAL,
    blinding: offerBlinding,
    data: { records: ftOffer.outputUtxos[1].data.records },
  },
  nullifierPubkey: zeroNullifierKey().publicKey(),
  utxoHash: offerHash,
  nullifier: zeroKeyNullifier(offerHash, offerBlinding),
  treeId: 0,
  leafIndex: BigInt(offerLeaf.leafIndex),
  ...(ftOffer.outputUtxos[1].dataHash ? { dataHash: ftOffer.outputUtxos[1].dataHash } : {}),
};
const offerDataUtxo = ctx.wasm.offerTermsDataUtxo(offerWalletUtxo);
const lenderIdentity = lender.keypair.shieldedAddress().signingPublicKey.ownerProofInputHash();
const loanOwnerAddr = ShieldedAddress.forPda({
  pda: enc.encode(lender.authority),
  nullifierPublicKey: zeroNullifierKey().publicKey(),
  viewingPublicKey: lender.keypair.shieldedAddress().viewingPublicKey,
});
const builtOrig = ctx.wasm.originateTransaction(
  {
    private: {
      txContext: { outputTreeId: 0, blindingSeed: seedFor(DROR, offerBlinding) },
      terms: { ...offerDataUtxo.data, collateralMint: { asset: "11111111111111111111111111111111", assetId: 1n } },
      offerUtxo: offerDataUtxo.utxo,
      collateralIn: wasmNote(borrower, collateralNote),
    },
    public: {
      expiry: offerTerms.expiry,
      firstNullifier: beDec(offerWalletUtxo.nullifier),
      loanOwner: loanOwnerAddr.toBytes(),
    },
  },
  borrower.keypair.shieldedAddress().toBytes(),
  borrower.solana,
);
const ftOrig = builtOrig.finalizedTx;
const origOutputs = ftOrig.outputUtxos.map(toTsOutput);
const { externalData: origExt } = await finalizeSpp(ctx, ftOrig, origOutputs, borrower.keypair, {
  expiryUnixTs: offerTerms.expiry,
  senderOutputCount: 1,
});
const origSpp = new SppProofInputs({
  payer: ftOrig.payer,
  inputUtxos: paddedInputs(ftOrig.inputUtxos.map(toTsInput), 2),
  outputs: origOutputs,
  externalData: origExt,
  blindingSeed: ftOrig.blindingSeed,
  outputTreeId: ftOrig.outputTreeId,
});
const origTransact = await ctx.client.proveTransact(origSpp, settleAuthority(ctx, borrower.keypair));
const origProof = circuitProof(ctx, "originate", builtOrig.proofInputs);
const origIx = await loanInstruction(ctx, {
  tag: TAG.ORIGINATE,
  body: [origProof, enc.encode(lender.solana), lender.keypair.shieldedAddress().viewingPublicKey.toBytes(), new Uint8Array([lender.authorityBump])],
  transact: origTransact,
  payer: borrower.solana,
  owners: [
    { address: lender.authority, signer: false },
    { address: borrower.solana, signer: true },
  ],
});
const origSig = await sendInstruction(ctx, origIx, borrower.signer);
console.log("ORIGINATE", `https://explorer.solana.com/tx/${origSig}`);

// The desk keeps the loan utxo client-side; probe does the same.
const loanHash = ftOrig.outputHashes[1];
const loanBlinding = ftOrig.outputUtxos[1].blinding;
const loanLeaf = await waitForLeaf(ctx, loanHash);
console.log("loan utxo:", hex(loanHash).slice(0, 12), "leaf", String(loanLeaf.leafIndex));

/* ------------------------------ 3. REPAY (borrower) ------------------------- */
stage("REPAY");
const borrowerNotes2 = await sync(ctx, borrower);
const repayNote = borrowerNotes2.find((u) => u.utxo.amount === REPAY);
if (!repayNote) throw new Error("no exact repay note");
const loanWalletUtxo = {
  utxo: {
    owner: ShieldedAddress.fromBytes(ftOrig.outputUtxos[1].ownerAddress).signingPublicKey.toBytes(),
    asset: { asset: "11111111111111111111111111111111", assetId: 1n },
    amount: COLLATERAL,
    blinding: loanBlinding,
    data: { records: ftOrig.outputUtxos[1].data.records },
  },
  nullifierPubkey: zeroNullifierKey().publicKey(),
  utxoHash: loanHash,
  nullifier: zeroKeyNullifier(loanHash, loanBlinding),
  treeId: 0,
  leafIndex: BigInt(loanLeaf.leafIndex),
  ...(ftOrig.outputUtxos[1].dataHash ? { dataHash: ftOrig.outputUtxos[1].dataHash } : {}),
};
const loanDataUtxo = ctx.wasm.loanTermsDataUtxo(loanWalletUtxo);
console.log("loan terms repay:", String(loanDataUtxo.data.repayAmount), "deadline:", String(loanDataUtxo.data.deadline));
const builtRepay = ctx.wasm.repayTransaction(
  {
    private: {
      txContext: { outputTreeId: 0, blindingSeed: seedFor(DRRP, loanBlinding) },
      terms: { ...loanDataUtxo.data, principalMint: { asset: "11111111111111111111111111111111", assetId: 1n } },
      loanUtxo: loanDataUtxo.utxo,
      repayIn: wasmNote(borrower, repayNote),
      lenderAddress: lender.keypair.shieldedAddress().toBytes(),
    },
    public: {
      deadline: loanDataUtxo.data.deadline,
      firstNullifier: beDec(loanWalletUtxo.nullifier),
    },
  },
  borrower.keypair.shieldedAddress().toBytes(),
  borrower.solana,
);
const ftRepay = builtRepay.finalizedTx;
const repayOutputs = ftRepay.outputUtxos.map(toTsOutput);
const { externalData: repayExt } = await finalizeSpp(ctx, ftRepay, repayOutputs, borrower.keypair, {
  expiryUnixTs: loanDataUtxo.data.deadline,
  senderOutputCount: 1,
});
const repaySpp = new SppProofInputs({
  payer: ftRepay.payer,
  inputUtxos: paddedInputs(ftRepay.inputUtxos.map(toTsInput), 2),
  outputs: repayOutputs,
  externalData: repayExt,
  blindingSeed: ftRepay.blindingSeed,
  outputTreeId: ftRepay.outputTreeId,
});
const repayTransact = await ctx.client.proveTransact(repaySpp, settleAuthority(ctx, borrower.keypair));
const repayProof = circuitProof(ctx, "repay", builtRepay.proofInputs);
const deadlineLE = new Uint8Array(8);
new DataView(deadlineLE.buffer).setBigUint64(0, loanDataUtxo.data.deadline, true);
const repayIx = await loanInstruction(ctx, {
  tag: TAG.REPAY,
  body: [repayProof, enc.encode(lender.solana), deadlineLE, new Uint8Array([lender.authorityBump])],
  transact: repayTransact,
  payer: borrower.solana,
  owners: [
    { address: lender.authority, signer: false },
    { address: borrower.solana, signer: true },
  ],
});
const repaySig = await sendInstruction(ctx, repayIx, borrower.signer);
console.log("REPAY   ", `https://explorer.solana.com/tx/${repaySig}`);

console.log("\nFULL LIFECYCLE FROM THE TS STACK, ON MAINNET");
console.log("offer    ", offerSig);
console.log("originate", origSig);
console.log("repay    ", repaySig);
