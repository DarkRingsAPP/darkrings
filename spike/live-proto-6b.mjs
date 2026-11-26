/* Recover-cancel: find the newest expired offer via discovery, decrypt it
   (borrower viewing key reads the PDA slot), and cancel it as the lender,
   returning the principal. Doubles as the first live CANCEL from TS. */
import { readFileSync } from "node:fs";
import {
  makeCtx,
  makeActor,
  beDec,
  zeroNullifierKey,
  settleAuthority,
  finalizeSpp,
  paddedInputs,
  circuitProof,
  loanInstruction,
  sendInstruction,
  toTsInput,
  toTsOutput,
  toTsOutputs,
  SppProofInputs,
  ShieldedAddress,
  decodeConfidential,
  enc,
  TAG,
} from "./live-lib.mjs";
import { ShieldedPublicKey } from "@heliuslabs/spr";
import { decodeOutputData } from "@heliuslabs/spr/transaction";
import { splitEmbeddedKey } from "./node_modules/@heliuslabs/spr/dist/transaction/serialization/codecs.js";
import { zeroKeyNullifier } from "./node_modules/@heliuslabs/spr/dist/keypair/nullifier-key.js";

const SEND = process.env.SEND === "1";
const hex = (b) => Buffer.from(b).toString("hex");
const u64le = (v) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, v, true); return b; };
const SOLM = { asset: "11111111111111111111111111111111", assetId: 1n };

const origFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const res = await origFetch(...args);
  if (!res.ok && String(args[0]).includes("spr")) {
    const clone = res.clone();
    const text = await clone.text().catch(() => "");
    console.log("PROVER HTTP", res.status, "BODY:", text.slice(0, 600));
  }
  return res;
};
const ctx = await makeCtx();
const home = process.env.HOME;
const lender = await makeActor(ctx, readFileSync(`${home}/.config/darkrings/lender.seed`));
const borrower = await makeActor(ctx, readFileSync(`${home}/.config/darkrings/borrower.seed`));

const tag = borrower.keypair.shieldedAddress().confidentialViewTag();
const found = await ctx.client.getEncryptedUtxosByTags({ tags: [tag] }).catch(() => null);
const byTags = await ctx.client.getShieldedTransactionsByTags({ tags: [tag] });
const markerTxs = (byTags.data ?? [])
  .filter((t) => t.events?.some((e) => e.messages?.length > 0))
  .sort((a, b) => Number(b.slot) - Number(a.slot));
console.log("marker txs:", markerTxs.map((t) => `${t.signature.slice(0, 8)}@${t.slot}`));

// Walk the markers newest-first; cancel the first whose offer is unspent and expired.
let target = null;
for (const mt of markerTxs) {
  const full = await ctx.client.getShieldedTransactionsBySignature(mt.signature);
  const event = (full.transactions ?? []).map((d) => d?.transaction ?? d).find((e) => e?.messages?.length > 0);
  if (!event) continue;
  const marker = event.messages[0];
  const offerHash = marker.data.slice(0, 32);
  const slotIndex = event.outputSlots.findIndex((s) => hex(s.outputContext.hash) === hex(offerHash));
  if (slotIndex < 0) continue;
  const slot = event.outputSlots[slotIndex];
  const frame = decodeOutputData(slot.payload);
  let confidential;
  try {
    confidential = decodeConfidential(
      borrower.keypair.decryptUtxo(splitEmbeddedKey(frame.body).rest, event.txViewingPublicKey, event.salt, slotIndex),
    );
  } catch {
    continue;
  }
  const nullifier = zeroKeyNullifier(offerHash, confidential.blinding);
  const spent = await ctx.client.getShieldedTransactionsByNullifiers({ nullifiers: [nullifier] });
  const spentTxs = spent.data ?? spent.transactions ?? [];
  if (spentTxs.length > 0) {
    console.log(`offer ${hex(offerHash).slice(0, 8)} already spent; skipping`);
    continue;
  }
  target = { event, marker, offerHash, slotIndex, slot, confidential };
  break;
}
if (!target) throw new Error("no unspent offer found");
console.log("cancel target offer:", hex(target.offerHash).slice(0, 12), "leaf", String(target.slot.outputContext.leafIndex));

const offerWalletUtxo = {
  utxo: {
    owner: ShieldedPublicKey.fromPda(enc.encode(lender.authority)).toBytes(),
    asset: SOLM,
    amount: target.confidential.amount,
    blinding: target.confidential.blinding,
    data: { records: target.confidential.data.records().map((r) => ({ kind: r.kind, bytes: r.bytes })) },
  },
  nullifierPubkey: zeroNullifierKey().publicKey(),
  utxoHash: target.offerHash,
  nullifier: zeroKeyNullifier(target.offerHash, target.confidential.blinding),
  treeId: 0,
  leafIndex: BigInt(target.slot.outputContext.leafIndex),
};
const dataUtxo = ctx.wasm.offerTermsDataUtxo(offerWalletUtxo);
const expiry = dataUtxo.data.expiry;
const now = BigInt(Math.floor(Date.now() / 1000));
console.log("offer expiry:", String(expiry), "now:", String(now), expiry < now ? "(expired ✓)" : "(STILL LIVE)");
if (expiry >= now) throw new Error("offer not yet expired");

const builtCancel = ctx.wasm.cancelTransaction(
  {
    private: {
      txContext: { outputTreeId: 0 },
      terms: { ...dataUtxo.data, collateralMint: SOLM },
      offerUtxo: dataUtxo.utxo,
    },
    public: {
      expiry,
      lenderOwnerPkField: beDec(lender.keypair.shieldedAddress().signingPublicKey.ownerProofInputHash()),
    },
  },
  lender.keypair.shieldedAddress().toBytes(),
  lender.solana,
);
const ft = builtCancel.finalizedTx;
console.log("cancel outputs:", ft.outputUtxos.map((o) => `${o.amount}${o.ownerAddress ? "" : " (pad)"}`));
const outputs = toTsOutputs(ft);
console.log("ownerTags:", JSON.stringify(ft.ownerTags, (k, v) => v instanceof Uint8Array || ArrayBuffer.isView(v) ? Buffer.from(v).toString("hex") : typeof v === "bigint" ? String(v) : v));
console.log("lender viewTag:", Buffer.from(lender.keypair.shieldedAddress().confidentialViewTag()).toString("hex"));
console.log("lender solana:", lender.solana, "authority:", lender.authority);
const { externalData } = await finalizeSpp(ctx, ft, outputs, lender.keypair, { senderOutputCount: 0 });
const spp = new SppProofInputs({
  payer: ft.payer,
  inputUtxos: paddedInputs(ft.inputUtxos.map(toTsInput), 2),
  outputs,
  externalData,
  blindingSeed: ft.blindingSeed,
  outputTreeId: ft.outputTreeId,
});
console.log("hash check:", hex(spp.privateTxHash()).slice(0, 12), "wasm:", hex(ft.paddingIndependentPrivateTxHash).slice(0, 12));
const transact = await ctx.client.proveTransact(spp, settleAuthority(ctx, lender.keypair));
const proof = circuitProof(ctx, "cancel", builtCancel.proofInputs);
const ix = await loanInstruction(ctx, {
  tag: TAG.CANCEL,
  body: [proof, u64le(expiry), new Uint8Array([lender.authorityBump])],
  transact,
  payer: lender.solana,
  lenderSigner: lender.solana,
  owners: [{ address: lender.authority, signer: false }],
});
if (!SEND) {
  console.log("CANCEL DRY RUN COMPLETE");
} else {
  const sig = await sendInstruction(ctx, ix, lender.signer);
  console.log("CANCEL LANDED FROM PURE TS:", `https://explorer.solana.com/tx/${sig}`);
}
