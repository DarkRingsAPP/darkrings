/* Probe 6: the last two instructions from the TS stack on mainnet.
   (a) CANCEL: offer with a 90s expiry, wait it out, lender reclaims.
   (b) CLAIM: offer + originate with a 150s deadline, wait it out, lender
       takes the collateral. Completes 5/5 instructions client-side. */
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
  toTsOutputs,
  SppProofInputs,
  ShieldedAddress,
  enc,
  TAG,
} from "./live-lib.mjs";
import { zeroKeyNullifier } from "./node_modules/@heliuslabs/spr/dist/keypair/nullifier-key.js";
import { poseidon as sdkPoseidon, bytesField } from "./node_modules/@heliuslabs/spr/dist/client/internal.js";

const stage = (s) => console.log(`\n== ${s}`);
const SEND = process.env.SEND === "1";
const hex = (b) => Buffer.from(b).toString("hex");
const DROR = Buffer.from("DROR").readUInt32BE(0);
const bigToBE32 = (v0) => { let v = v0; const out = new Uint8Array(32); for (let i = 31; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; } return out; };
const seedFor = (domain, blinding) => bigToBE32(sdkPoseidon([BigInt(domain), bytesField(blinding, "b")]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const u64le = (v) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, v, true); return b; };
const SOLM = { asset: "11111111111111111111111111111111", assetId: 1n };

const ctx = await makeCtx();
const home = process.env.HOME;
const lender = await makeActor(ctx, readFileSync(`${home}/.config/darkrings/lender.seed`));
const borrower = await makeActor(ctx, readFileSync(`${home}/.config/darkrings/borrower.seed`));
const PRINCIPAL = 2_000_000n;
const COLLATERAL = 2_500_000n;
const REPAY = 2_100_000n;

async function makeOffer({ expiry, deadline }) {
  const notes = await sync(ctx, lender);
  const source = notes.find((u) => u.utxo.amount >= PRINCIPAL);
  if (!source) throw new Error("no lender source note >= principal");
  const borrowerIdentity = borrower.keypair.shieldedAddress().signingPublicKey.ownerProofInputHash();
  const offerOwnerAddr = ShieldedAddress.forPda({
    pda: enc.encode(lender.authority),
    nullifierPublicKey: zeroNullifierKey().publicKey(),
    viewingPublicKey: borrower.keypair.shieldedAddress().viewingPublicKey,
  });
  const built = ctx.wasm.offerTransaction(
    {
      private: {
        txContext: { outputTreeId: 0 },
        source: wasmNote(lender, source),
        principalAmount: PRINCIPAL,
        collateralMint: SOLM,
        collateralAmount: COLLATERAL,
        repayAmount: REPAY,
        deadline,
        expiry,
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
  const ft = built.finalizedTx;
  const offerHash = ft.outputHashes[1];
  const markerData = new Uint8Array(64);
  markerData.set(offerHash, 0);
  markerData.set(enc.encode(lender.solana), 32);
  const outputs = toTsOutputs(ft);
  const { externalData } = await finalizeSpp(ctx, ft, outputs, lender.keypair, {
    expiryUnixTs: expiry,
    senderOutputCount: 1,
    messages: [{ viewTag: borrower.keypair.shieldedAddress().confidentialViewTag(), data: markerData }],
  });
  const spp = new SppProofInputs({
    payer: ft.payer,
    inputUtxos: paddedInputs(ft.inputUtxos.map(toTsInput), 2),
    outputs,
    externalData,
    blindingSeed: ft.blindingSeed,
    outputTreeId: ft.outputTreeId,
  });
  const transact = await ctx.client.proveTransact(spp, settleAuthority(ctx, lender.keypair));
  const proof = circuitProof(ctx, "offer", built.proofInputs);
  const ix = await loanInstruction(ctx, {
    tag: TAG.OFFER,
    body: [proof, borrower.keypair.shieldedAddress().viewingPublicKey.toBytes(), new Uint8Array([lender.authorityBump])],
    transact,
    payer: lender.solana,
    owners: [
      { address: lender.solana, signer: true },
      { address: lender.authority, signer: false },
    ],
  });
  const sig = await sendInstruction(ctx, ix, lender.signer);
  const leaf = await waitForLeaf(ctx, offerHash);
  return { built, ft, offerHash, leaf, sig };
}

function offerWallet(ft, offerHash, leaf) {
  return {
    utxo: {
      owner: ShieldedAddress.fromBytes(ft.outputUtxos[1].ownerAddress).signingPublicKey.toBytes(),
      asset: SOLM,
      amount: PRINCIPAL,
      blinding: ft.outputUtxos[1].blinding,
      data: { records: ft.outputUtxos[1].data.records },
    },
    nullifierPubkey: zeroNullifierKey().publicKey(),
    utxoHash: offerHash,
    nullifier: zeroKeyNullifier(offerHash, ft.outputUtxos[1].blinding),
    treeId: 0,
    leafIndex: BigInt(leaf.leafIndex),
    ...(ft.outputUtxos[1].dataHash ? { dataHash: ft.outputUtxos[1].dataHash } : {}),
  };
}

if (!SEND) {
  console.log("probe 6 is submit-only; set SEND=1");
  process.exit(0);
}

/* --------------------------------- CANCEL --------------------------------- */
stage("CANCEL: offer with 90s expiry");
const now1 = BigInt(Math.floor(Date.now() / 1000));
const exp1 = now1 + 90n;
const o1 = await makeOffer({ expiry: exp1, deadline: now1 + 86_400n });
console.log("offer:", o1.sig);
const dataUtxo1 = ctx.wasm.offerTermsDataUtxo(offerWallet(o1.ft, o1.offerHash, o1.leaf));
const waitMs1 = Number(exp1 + 15n - BigInt(Math.floor(Date.now() / 1000))) * 1000;
console.log("waiting", Math.max(waitMs1, 0) / 1000, "s for expiry…");
await sleep(Math.max(waitMs1, 0));
const builtCancel = ctx.wasm.cancelTransaction(
  {
    private: {
      txContext: { outputTreeId: 0 },
      terms: { ...dataUtxo1.data, collateralMint: SOLM },
      offerUtxo: dataUtxo1.utxo,
    },
    public: {
      expiry: exp1,
      lenderOwnerPkField: beDec(lender.keypair.shieldedAddress().signingPublicKey.ownerProofInputHash()),
    },
  },
  lender.keypair.shieldedAddress().toBytes(),
  lender.solana,
);
const ftC = builtCancel.finalizedTx;
const cOutputs = toTsOutputs(ftC);
const { externalData: cExt } = await finalizeSpp(ctx, ftC, cOutputs, lender.keypair, { senderOutputCount: cOutputs.length });
const cSpp = new SppProofInputs({
  payer: ftC.payer,
  inputUtxos: paddedInputs(ftC.inputUtxos.map(toTsInput), 2),
  outputs: cOutputs,
  externalData: cExt,
  blindingSeed: ftC.blindingSeed,
  outputTreeId: ftC.outputTreeId,
});
const cTransact = await ctx.client.proveTransact(cSpp, settleAuthority(ctx, lender.keypair));
const cProof = circuitProof(ctx, "cancel", builtCancel.proofInputs);
const cancelIx = await loanInstruction(ctx, {
  tag: TAG.CANCEL,
  body: [cProof, u64le(exp1), new Uint8Array([lender.authorityBump])],
  transact: cTransact,
  payer: lender.solana,
  lenderSigner: lender.solana,
  owners: [{ address: lender.authority, signer: false }],
});
const cancelSig = await sendInstruction(ctx, cancelIx, lender.signer);
console.log("CANCEL  ", `https://explorer.solana.com/tx/${cancelSig}`);

/* ---------------------------------- CLAIM ---------------------------------- */
stage("CLAIM: offer + originate with 150s deadline");
const now2 = BigInt(Math.floor(Date.now() / 1000));
const dl = now2 + 150n;
const o2 = await makeOffer({ expiry: now2 + 3600n, deadline: dl });
console.log("offer:", o2.sig);
const dataUtxo2 = ctx.wasm.offerTermsDataUtxo(offerWallet(o2.ft, o2.offerHash, o2.leaf));
const bNotes = await sync(ctx, borrower);
const collateralNote = bNotes.find((u) => u.utxo.amount === COLLATERAL);
if (!collateralNote) throw new Error("no exact collateral note");
const loanOwnerAddr = ShieldedAddress.forPda({
  pda: enc.encode(lender.authority),
  nullifierPublicKey: zeroNullifierKey().publicKey(),
  viewingPublicKey: lender.keypair.shieldedAddress().viewingPublicKey,
});
const offerBlinding2 = o2.ft.outputUtxos[1].blinding;
const builtOrig = ctx.wasm.originateTransaction(
  {
    private: {
      txContext: { outputTreeId: 0, blindingSeed: seedFor(DROR, offerBlinding2) },
      terms: { ...dataUtxo2.data, collateralMint: SOLM },
      offerUtxo: dataUtxo2.utxo,
      collateralIn: wasmNote(borrower, collateralNote),
    },
    public: {
      expiry: now2 + 3600n,
      firstNullifier: beDec(zeroKeyNullifier(o2.offerHash, offerBlinding2)),
      loanOwner: loanOwnerAddr.toBytes(),
    },
  },
  borrower.keypair.shieldedAddress().toBytes(),
  borrower.solana,
);
const ftO2 = builtOrig.finalizedTx;
const oOutputs = toTsOutputs(ftO2);
const { externalData: oExt } = await finalizeSpp(ctx, ftO2, oOutputs, borrower.keypair, {
  expiryUnixTs: now2 + 3600n,
  senderOutputCount: 1,
});
const oSpp = new SppProofInputs({
  payer: ftO2.payer,
  inputUtxos: paddedInputs(ftO2.inputUtxos.map(toTsInput), 2),
  outputs: oOutputs,
  externalData: oExt,
  blindingSeed: ftO2.blindingSeed,
  outputTreeId: ftO2.outputTreeId,
});
const oTransact = await ctx.client.proveTransact(oSpp, settleAuthority(ctx, borrower.keypair));
const oProof = circuitProof(ctx, "originate", builtOrig.proofInputs);
const origIx = await loanInstruction(ctx, {
  tag: TAG.ORIGINATE,
  body: [oProof, enc.encode(lender.solana), lender.keypair.shieldedAddress().viewingPublicKey.toBytes(), new Uint8Array([lender.authorityBump])],
  transact: oTransact,
  payer: borrower.solana,
  owners: [
    { address: lender.authority, signer: false },
    { address: borrower.solana, signer: true },
  ],
});
const origSig = await sendInstruction(ctx, origIx, borrower.signer);
console.log("originate:", origSig);
const loanHash = ftO2.outputHashes[1];
const loanBlinding = ftO2.outputUtxos[1].blinding;
const loanLeaf = await waitForLeaf(ctx, loanHash);
const loanWalletUtxo = {
  utxo: {
    owner: ShieldedAddress.fromBytes(ftO2.outputUtxos[1].ownerAddress).signingPublicKey.toBytes(),
    asset: SOLM,
    amount: COLLATERAL,
    blinding: loanBlinding,
    data: { records: ftO2.outputUtxos[1].data.records },
  },
  nullifierPubkey: zeroNullifierKey().publicKey(),
  utxoHash: loanHash,
  nullifier: zeroKeyNullifier(loanHash, loanBlinding),
  treeId: 0,
  leafIndex: BigInt(loanLeaf.leafIndex),
  ...(ftO2.outputUtxos[1].dataHash ? { dataHash: ftO2.outputUtxos[1].dataHash } : {}),
};
const loanDataUtxo = ctx.wasm.loanTermsDataUtxo(loanWalletUtxo);
const waitMs2 = Number(dl + 15n - BigInt(Math.floor(Date.now() / 1000))) * 1000;
console.log("waiting", Math.max(waitMs2, 0) / 1000, "s for the deadline…");
await sleep(Math.max(waitMs2, 0));
const builtClaim = ctx.wasm.claimTransaction(
  {
    private: {
      txContext: { outputTreeId: 0 },
      loanUtxo: loanDataUtxo.utxo,
      terms: { ...loanDataUtxo.data, principalMint: SOLM },
    },
    public: {
      deadline: dl,
      lenderOwnerPkField: beDec(lender.keypair.shieldedAddress().signingPublicKey.ownerProofInputHash()),
    },
  },
  lender.keypair.shieldedAddress().toBytes(),
  lender.solana,
);
const ftCl = builtClaim.finalizedTx;
const clOutputs = toTsOutputs(ftCl);
const { externalData: clExt } = await finalizeSpp(ctx, ftCl, clOutputs, lender.keypair, { senderOutputCount: clOutputs.length });
const clSpp = new SppProofInputs({
  payer: ftCl.payer,
  inputUtxos: paddedInputs(ftCl.inputUtxos.map(toTsInput), 2),
  outputs: clOutputs,
  externalData: clExt,
  blindingSeed: ftCl.blindingSeed,
  outputTreeId: ftCl.outputTreeId,
});
const clTransact = await ctx.client.proveTransact(clSpp, settleAuthority(ctx, lender.keypair));
const clProof = circuitProof(ctx, "claim", builtClaim.proofInputs);
const claimIx = await loanInstruction(ctx, {
  tag: TAG.CLAIM,
  body: [clProof, u64le(dl), new Uint8Array([lender.authorityBump])],
  transact: clTransact,
  payer: lender.solana,
  lenderSigner: lender.solana,
  owners: [{ address: lender.authority, signer: false }],
});
const claimSig = await sendInstruction(ctx, claimIx, lender.signer);
console.log("CLAIM   ", `https://explorer.solana.com/tx/${claimSig}`);

console.log("\nALL FIVE INSTRUCTIONS EXERCISED FROM THE TS STACK ON MAINNET");
console.log("cancel-offer", o1.sig);
console.log("cancel      ", cancelSig);
console.log("claim-offer ", o2.sig);
console.log("originate   ", origSig);
console.log("claim       ", claimSig);
