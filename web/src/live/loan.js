/* The live loan engine for the desk. A direct port of spike/live-lib.mjs and
   the probe flows that landed offer, originate, repay, cancel and claim on
   mainnet from the TS stack; browser adaptations only (fetched artifacts,
   web-target wasm, no Buffer). */
import {
  NullifierKey,
  ShieldedAddress,
  ShieldedPublicKey,
  SHIELDED_POOL_PROGRAM_ID,
  syncWallet,
} from "@heliuslabs/spr";
import {
  AssetRegistry,
  Data,
  LocalShieldedKeys,
  ProofInputUtxo,
  SppProofInputs,
  Utxo,
  createExternalData,
  createProofOutput,
  decodeConfidential,
  encryptConfidentialTransfer,
  decodeOutputData,
} from "@heliuslabs/spr/transaction";
import { InstructionTag, encodeTransactInstructionData } from "@heliuslabs/spr/interface";
import { getDepositInstructionAsync, getNullifierPdaAccountsAsync } from "@heliuslabs/spr/instructions";
import { getTreeAddress } from "@heliuslabs/spr/addresses";
import { getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";

// Deep paths the export map does not list; pinned and proven by the spike.
import { compileUnsignedTransaction } from "@spr-dist/flows/compile.js";
import { decodeIndexedInputs } from "@spr-dist/client/prover/indexed.js";
import { bytesField, poseidon as sdkPoseidon } from "@spr-dist/client/internal.js";
import { asField } from "@spr-dist/client/prover/assembly.js";
import { splitEmbeddedKey } from "@spr-dist/transaction/serialization/codecs.js";
import { zeroKeyNullifier } from "@spr-dist/keypair/nullifier-key.js";

import initWasm, * as wasm from "./zk/loan_program.js";
import { getClient } from "./client.js";
import { submit } from "./session.js";

export const LOAN_PROGRAM = "4j3MfrBtrhrLV4Lu7JpP5TqbAHbZY6AkLmMUaR3TZHfE";
export const TAG = { OFFER: 0, ORIGINATE: 1, REPAY: 2, CLAIM: 3, CANCEL: 4 };
export const SOL_MINT_ADDR = "11111111111111111111111111111111";
export const SOLM = { asset: SOL_MINT_ADDR, assetId: 1n };
export const enc = getAddressEncoder();

const te = new TextEncoder();
const domain = (s) => new DataView(te.encode(s).buffer).getUint32(0, false);
export const DROR = domain("DROR");
export const DRRP = domain("DRRP");

export const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const unhex = (s) => Uint8Array.from(s.match(/.{2}/g) ?? [], (x) => parseInt(x, 16));
const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
export const beDec = (b) => {
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  return v.toString();
};
const bigToBE32 = (v0) => {
  let v = v0;
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
};
export const seedFor = (dom, blinding) => bigToBE32(sdkPoseidon([BigInt(dom), bytesField(blinding, "blinding")]));
const u64le = (v) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(v), true);
  return b;
};
export const explorer = (sig) => `https://explorer.solana.com/tx/${sig}`;

/* ------------------------------- context ---------------------------------- */

let ctxPromise = null;
export function getCtx() {
  ctxPromise ??= (async () => {
    const client = await getClient();
    await initWasm({ module_or_path: "/zk/loan_program_bg.wasm" });
    const tree = await getTreeAddress(0);
    return { client, wasm, tree };
  })();
  return ctxPromise;
}

const artifactCache = new Map();
async function artifact(circuit, file) {
  const key = `${circuit}/${file}`;
  if (!artifactCache.has(key)) {
    artifactCache.set(
      key,
      fetch(`/zk/${circuit}/${file}`).then(async (r) => {
        if (!r.ok) throw new Error(`artifact ${key}: HTTP ${r.status}`);
        return new Uint8Array(await r.arrayBuffer());
      }),
    );
  }
  return artifactCache.get(key);
}

/* -------------------------------- actors ---------------------------------- */

export const zeroNullifierKey = () => NullifierKey.fromSecret(new Uint8Array(31));

/** Extends a session actor with its loan-authority PDA. */
export async function withAuthority(actor) {
  if (actor.authority) return actor;
  const solana = actor.keypair.shieldedAddress().solanaAddress();
  const [authority, authorityBump] = await getProgramDerivedAddress({
    programAddress: LOAN_PROGRAM,
    seeds: ["loan_authority", enc.encode(solana)],
  });
  return Object.assign(actor, { solana, authority, authorityBump });
}

export async function syncNotes(actor) {
  const { client } = await getCtx();
  await syncWallet({ client, wallet: actor.wallet, keys: actor.keys });
  return actor.wallet.utxos().filter((u) => !u.spent);
}

export async function solBalance(actor) {
  const { client } = await getCtx();
  const { value } = await client.solanaRpc.getBalance(actor.solana ?? actor.keypair.shieldedAddress().solanaAddress()).send();
  return BigInt(value);
}

/* ---------------------------- deposit (shield) ----------------------------- */

export async function deposit(actor, lamports) {
  const ctx = await getCtx();
  const addr = actor.keypair.shieldedAddress();
  const ix = await getDepositInstructionAsync({
    tree: ctx.tree,
    depositor: actor.signer.address,
    deposits: [
      {
        asset: { kind: "sol" },
        viewTag: addr.confidentialViewTag(),
        recipientOwnerHash: addr.ownerHash(),
        amount: BigInt(lamports),
      },
    ],
  });
  const sig = await sendInstruction(ix, actor);
  return { sig, explorer: explorer(sig) };
}

/* -------------------- wasm <-> TS shape conversions ------------------------ */

export function wasmNote(actor, note) {
  return {
    utxo: {
      owner: note.utxo.owner.toBytes(),
      asset: { asset: String(note.utxo.asset), assetId: 1n },
      amount: note.utxo.amount,
      blinding: note.utxo.blinding,
    },
    nullifierPubkey: actor.keypair.shieldedAddress().nullifierPublicKey,
    utxoHash: note.outputContext.hash,
    nullifier: note.nullifier,
    treeId: 0,
    leafIndex: note.outputContext.leafIndex,
  };
}

export function toTsInput(u) {
  return new ProofInputUtxo({
    utxo: new Utxo({
      owner: ShieldedPublicKey.fromBytes(u.utxo.owner),
      asset: SOL_MINT_ADDR,
      amount: u.utxo.amount,
      blinding: u.utxo.blinding,
    }),
    nullifierPublicKey: u.nullifierPubkey,
    nullifier: u.nullifier,
    treeId: u.treeId ?? 0,
    ...(u.dataHash ? { dataHash: u.dataHash } : {}),
  });
}

export function toTsOutput(o, padTag) {
  if (!o.ownerAddress) {
    // Padding slot. A zero resolved tag means compact padding (publishes hash
    // 0 and owner tag 0); a named tag means a random dummy. A non-compact pad
    // with a zero tag names nobody, which the circuit rejects.
    const tag = padTag ?? o.ownerTag;
    const compact = !tag || [...tag].every((b) => b === 0);
    return createProofOutput({
      asset: SOL_MINT_ADDR,
      amount: 0n,
      blinding: o.blinding,
      ...(compact ? { compact: true } : { ownerTag: tag }),
    });
  }
  return createProofOutput({
    ownerAddress: ShieldedAddress.fromBytes(o.ownerAddress),
    asset: SOL_MINT_ADDR,
    amount: o.amount,
    blinding: o.blinding,
    ...(o.dataHash ? { dataHash: o.dataHash } : {}),
    data: new Data(o.data?.records ?? []),
  });
}

export function toTsOutputs(ft) {
  return ft.outputUtxos.map((o, i) => toTsOutput(o, o.ownerAddress ? undefined : ft.ownerTags?.[i]?.resolved));
}

export function paddedInputs(inputs, shapeInputs = 2) {
  const padded = [...inputs];
  while (padded.length < shapeInputs) padded.push(ProofInputUtxo.dummy(undefined, 0));
  return padded;
}

/* --------------------- proving and instruction assembly -------------------- */

export function settleAuthority(ctx, actorKeypair) {
  const service = ctx.client.proofService;
  const keys = [zeroNullifierKey(), actorKeypair.nullifierKey()];
  const fill = (inputs) =>
    inputs.map((input) => {
      if (input.nullifierSecret !== undefined || input.isDummy !== 0n) return input;
      for (const key of keys) {
        const pk = bytesField(key.publicKey(), "nullifier public key");
        if (input.circuit.owner === sdkPoseidon([input.ownerPublicKeyHash, pk])) {
          const secret = key.secretBytes();
          try {
            return Object.freeze({ ...input, nullifierSecret: asField(bytesField(secret, "nullifier secret")) });
          } finally {
            secret.fill(0);
          }
        }
      }
      throw new Error("no key completes this input");
    });
  const withInputs = (request, inputs) =>
    Object.freeze({ ...request, payload: Object.freeze({ ...request.payload, inputs: Object.freeze(inputs) }) });
  return {
    prove: (inputs, context) => service.prove(withInputs(inputs, fill(inputs.payload.inputs)), context),
    proveMerge: () => {
      throw new Error("merge unsupported");
    },
    proveIndexed: (request, context) => {
      const decoded = decodeIndexedInputs(request);
      return service.proveIndexed(withInputs(decoded, fill(decoded.payload.inputs)), context);
    },
  };
}

export async function finalizeSpp(ctx, ft, tsOutputs, senderKeypair, { messages = [], expiryUnixTs, senderOutputCount = 1 } = {}) {
  const senderResolved = senderKeypair.shieldedAddress().confidentialViewTag();
  const payerIsSender =
    sameBytes(new Uint8Array(enc.encode(ft.payer)), new Uint8Array(senderResolved)) ||
    ft.payer === senderKeypair.shieldedAddress().solanaAddress();
  const senderTag = payerIsSender ? { kind: "account", index: 0 } : { kind: "inline", value: senderResolved };
  const [key] = await LocalShieldedKeys.fromKeypair(senderKeypair).transactionKeys([
    { viewingPublicKey: senderKeypair.shieldedAddress().viewingPublicKey, firstNullifier: ft.firstNullifier },
  ]);
  const encrypted = encryptConfidentialTransfer(key, { outputs: tsOutputs, assets: new AssetRegistry() });
  const txOutputs = [];
  const resolvedTags = [];
  const realLength = encrypted.payload.find((p) => p)?.data.length ?? 0;
  tsOutputs.forEach((output, index) => {
    const slot = encrypted.payload[index];
    const utxoHash = output.hash(ft.outputTreeId);
    if (!slot) {
      // Trailing compact padding is left out of the external data (SPP reads
      // the omitted tag as 0); a named dummy gets a random length-matched body.
      if (output.isCompact()) return;
      const tag = ft.ownerTags[index];
      const body = new Uint8Array(realLength);
      crypto.getRandomValues(body);
      txOutputs.push({ utxoHash, ownerTag: tag.tag, data: body });
      resolvedTags.push(tag.resolved);
    } else if (index < senderOutputCount) {
      txOutputs.push({ utxoHash, ownerTag: senderTag, data: slot.data });
      resolvedTags.push(senderResolved);
    } else {
      txOutputs.push({ utxoHash, ownerTag: { kind: "inline", value: slot.viewTag }, data: slot.data });
      resolvedTags.push(slot.viewTag);
    }
  });
  const externalData = createExternalData({
    instructionDiscriminator: InstructionTag.transact,
    ...(expiryUnixTs === undefined ? {} : { expiryUnixTs }),
    txViewingPublicKey: encrypted.txViewingPublicKey,
    salt: encrypted.salt,
    outputs: txOutputs,
    resolvedOwnerTags: resolvedTags,
    messages,
  });
  return { externalData };
}

export async function circuitProof(ctx, circuitName, flatInputs) {
  const [xbc, pk] = await Promise.all([artifact(circuitName, "circuit.xbc"), artifact(circuitName, "pk.bin")]);
  const bundle = ctx.wasm.prove(xbc, pk, flatInputs);
  const proof = ctx.wasm.compressedProgramProof(bundle.proof);
  if (proof.length !== 128) throw new Error(`proof not 128B: ${proof.length}`);
  return proof;
}

export async function loanInstruction(ctx, { tag, body, transact, payer, owners = [], lenderSigner }) {
  const transactBytes = encodeTransactInstructionData(transact);
  const data = new Uint8Array(1 + body.reduce((n, b) => n + b.length, 0) + transactBytes.length);
  let off = 0;
  data[off++] = tag;
  for (const part of body) {
    data.set(part, off);
    off += part.length;
  }
  data.set(transactBytes, off);
  const nullifierPdas = await getNullifierPdaAccountsAsync(
    ctx.tree,
    transact.inputs.map((i) => i.nullifierHash),
  );
  const accounts = [
    { address: payer, role: 3 },
    ...(lenderSigner ? [{ address: lenderSigner, role: 2 }] : []),
    { address: payer, role: 3 },
    { address: ctx.tree, role: 1 },
    { address: SHIELDED_POOL_PROGRAM_ID, role: 0 },
    { address: SOL_MINT_ADDR, role: 0 },
    { address: ctx.tree, role: 1 },
    ...nullifierPdas,
    ...owners.map(({ address, signer }) => ({ address, role: signer ? 2 : 0 })),
  ];
  return { programAddress: LOAN_PROGRAM, accounts, data };
}

export async function sendInstruction(ix, actor) {
  const { client } = await getCtx();
  const { value: blockhash } = await client.solanaRpc.getLatestBlockhash().send();
  const tx = compileUnsignedTransaction({
    feePayer: actor.signer.address,
    lifetime: blockhash,
    instructions: [ix],
    computeUnitLimit: 1_400_000,
    priorityFeeLamports: 100_000n,
  });
  const { sig } = await submit(tx, [actor.signer]);
  return sig;
}

export async function waitForLeaf(utxoHash, timeoutMs = 180_000) {
  const ctx = await getCtx();
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try {
      const r = await ctx.client.getMerkleProofs(ctx.tree, [utxoHash]);
      const proof = r.proofs?.[0];
      if (proof) return proof;
    } catch (e) {
      last = e;
    }
    await new Promise((s) => setTimeout(s, 1500));
  }
  throw last ?? new Error("merkle proof timeout");
}

/* ------------------------------ local records ------------------------------ */
/* The desk keeps what each side would keep: the lender its posted offers and
   loans, the borrower its originations. Bytes as hex, amounts as strings. */

const STATE_KEY = "darkrings.live.state.v1";

export function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY)) ?? { offers: [], loans: [] };
  } catch {
    return { offers: [], loans: [] };
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* ephemeral session */
  }
}

function recordUtxo(ft, hash, leafIndex) {
  const out = ft.outputUtxos[1];
  return {
    hash: hex(hash),
    blinding: hex(out.blinding),
    owner: hex(out.ownerAddress),
    records: (out.data?.records ?? []).map((r) => ({ kind: r.kind, bytes: hex(r.bytes) })),
    dataHash: out.dataHash ? hex(out.dataHash) : null,
    leafIndex: String(leafIndex),
  };
}

function walletUtxoFromRecord(rec, amount) {
  return {
    utxo: {
      owner: ShieldedAddress.fromBytes(unhex(rec.owner)).signingPublicKey.toBytes(),
      asset: SOLM,
      amount: BigInt(amount),
      blinding: unhex(rec.blinding),
      data: { records: rec.records.map((r) => ({ kind: r.kind, bytes: unhex(r.bytes) })) },
    },
    nullifierPubkey: zeroNullifierKey().publicKey(),
    utxoHash: unhex(rec.hash),
    nullifier: zeroKeyNullifier(unhex(rec.hash), unhex(rec.blinding)),
    treeId: 0,
    leafIndex: BigInt(rec.leafIndex),
    ...(rec.dataHash ? { dataHash: unhex(rec.dataHash) } : {}),
  };
}

/* --------------------------------- flows ----------------------------------- */

/** Lender posts an offer directed at `borrower` (both are session actors). */
export async function postOffer(lender, borrower, terms) {
  const ctx = await getCtx();
  await withAuthority(lender);
  const notes = await syncNotes(lender);
  const source = notes.find((u) => u.utxo.amount >= terms.principal);
  if (!source) throw new Error("no shielded note covers the principal; deposit first");
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
        principalAmount: BigInt(terms.principal),
        collateralMint: SOLM,
        collateralAmount: BigInt(terms.collateral),
        repayAmount: BigInt(terms.repay),
        deadline: BigInt(terms.deadline),
        expiry: BigInt(terms.expiry),
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
    expiryUnixTs: BigInt(terms.expiry),
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
  const proof = await circuitProof(ctx, "offer", built.proofInputs);
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
  const sig = await sendInstruction(ix, lender);
  const leaf = await waitForLeaf(offerHash);
  const state = loadState();
  const record = {
    id: hex(offerHash).slice(0, 12),
    utxo: recordUtxo(ft, offerHash, leaf.leafIndex),
    principal: String(terms.principal),
    collateral: String(terms.collateral),
    repay: String(terms.repay),
    expiry: String(terms.expiry),
    deadline: String(terms.deadline),
    lenderSolana: lender.solana,
    status: "open",
    txs: { offer: sig },
  };
  state.offers.push(record);
  saveState(state);
  return { record, sig, explorer: explorer(sig) };
}

/** Borrower-side discovery: markers to this viewing tag, decrypted and checked. */
export async function discoverOffers(borrower) {
  const ctx = await getCtx();
  const tag = borrower.keypair.shieldedAddress().confidentialViewTag();
  const byTags = await ctx.client.getShieldedTransactionsByTags({ tags: [tag] });
  const markerTxs = (byTags.data ?? [])
    .filter((t) => t.events?.some((e) => e.messages?.length > 0))
    .sort((a, b) => Number(b.slot) - Number(a.slot));
  const offers = [];
  for (const mt of markerTxs) {
    const full = await ctx.client.getShieldedTransactionsBySignature(mt.signature);
    const event = (full.transactions ?? []).map((d) => d?.transaction ?? d).find((e) => e?.messages?.length > 0);
    if (!event) continue;
    const marker = event.messages[0];
    if (marker.data.length < 64) continue;
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
    if (spentTxs.length > 0) continue;
    offers.push({
      offerHash,
      slot,
      event,
      confidential,
      signature: mt.signature,
      lenderSolanaBytes: marker.data.slice(32, 64),
    });
  }
  return offers;
}

export async function originate(borrower, lender, offerRecord) {
  const ctx = await getCtx();
  await withAuthority(lender);
  await withAuthority(borrower);
  const notes = await syncNotes(borrower);
  const need = BigInt(offerRecord.collateral);
  const collateralNote = notes.find((u) => u.utxo.amount === need);
  if (!collateralNote) throw new Error("no shielded note matches the collateral exactly; deposit that amount");
  const offerWalletUtxo = walletUtxoFromRecord(offerRecord.utxo, offerRecord.principal);
  const offerDataUtxo = ctx.wasm.offerTermsDataUtxo(offerWalletUtxo);
  const loanOwnerAddr = ShieldedAddress.forPda({
    pda: enc.encode(lender.authority),
    nullifierPublicKey: zeroNullifierKey().publicKey(),
    viewingPublicKey: lender.keypair.shieldedAddress().viewingPublicKey,
  });
  const offerBlinding = unhex(offerRecord.utxo.blinding);
  const built = ctx.wasm.originateTransaction(
    {
      private: {
        txContext: { outputTreeId: 0, blindingSeed: seedFor(DROR, offerBlinding) },
        terms: { ...offerDataUtxo.data, collateralMint: SOLM },
        offerUtxo: offerDataUtxo.utxo,
        collateralIn: wasmNote(borrower, collateralNote),
      },
      public: {
        expiry: BigInt(offerRecord.expiry),
        firstNullifier: beDec(offerWalletUtxo.nullifier),
        loanOwner: loanOwnerAddr.toBytes(),
      },
    },
    borrower.keypair.shieldedAddress().toBytes(),
    borrower.solana,
  );
  const ft = built.finalizedTx;
  const outputs = toTsOutputs(ft);
  const { externalData } = await finalizeSpp(ctx, ft, outputs, borrower.keypair, {
    expiryUnixTs: BigInt(offerRecord.expiry),
    senderOutputCount: 1,
  });
  const spp = new SppProofInputs({
    payer: ft.payer,
    inputUtxos: paddedInputs(ft.inputUtxos.map(toTsInput), 2),
    outputs,
    externalData,
    blindingSeed: ft.blindingSeed,
    outputTreeId: ft.outputTreeId,
  });
  const transact = await ctx.client.proveTransact(spp, settleAuthority(ctx, borrower.keypair));
  const proof = await circuitProof(ctx, "originate", built.proofInputs);
  const ix = await loanInstruction(ctx, {
    tag: TAG.ORIGINATE,
    body: [proof, enc.encode(lender.solana), lender.keypair.shieldedAddress().viewingPublicKey.toBytes(), new Uint8Array([lender.authorityBump])],
    transact,
    payer: borrower.solana,
    owners: [
      { address: lender.authority, signer: false },
      { address: borrower.solana, signer: true },
    ],
  });
  const sig = await sendInstruction(ix, borrower);
  const loanHash = ft.outputHashes[1];
  const leaf = await waitForLeaf(loanHash);
  const state = loadState();
  const offer = state.offers.find((o) => o.id === offerRecord.id);
  if (offer) {
    offer.status = "originated";
    offer.txs.originate = sig;
  }
  const loan = {
    id: hex(loanHash).slice(0, 12),
    utxo: recordUtxo(ft, loanHash, leaf.leafIndex),
    offerId: offerRecord.id,
    principal: offerRecord.principal,
    collateral: offerRecord.collateral,
    repay: offerRecord.repay,
    deadline: offerRecord.deadline,
    lenderSolana: lender.solana,
    status: "active",
    txs: { originate: sig },
  };
  state.loans.push(loan);
  saveState(state);
  return { loan, sig, explorer: explorer(sig) };
}

export async function repay(borrower, lender, loanRecord) {
  const ctx = await getCtx();
  await withAuthority(lender);
  await withAuthority(borrower);
  const notes = await syncNotes(borrower);
  const need = BigInt(loanRecord.repay);
  const repayNote = notes.find((u) => u.utxo.amount === need);
  if (!repayNote) throw new Error("no shielded note matches the repay amount exactly; deposit that amount");
  const loanWalletUtxo = walletUtxoFromRecord(loanRecord.utxo, loanRecord.collateral);
  const loanDataUtxo = ctx.wasm.loanTermsDataUtxo(loanWalletUtxo);
  const loanBlinding = unhex(loanRecord.utxo.blinding);
  const built = ctx.wasm.repayTransaction(
    {
      private: {
        txContext: { outputTreeId: 0, blindingSeed: seedFor(DRRP, loanBlinding) },
        terms: { ...loanDataUtxo.data, principalMint: SOLM },
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
  const ft = built.finalizedTx;
  const outputs = toTsOutputs(ft);
  const { externalData } = await finalizeSpp(ctx, ft, outputs, borrower.keypair, {
    expiryUnixTs: loanDataUtxo.data.deadline,
    senderOutputCount: 1,
  });
  const spp = new SppProofInputs({
    payer: ft.payer,
    inputUtxos: paddedInputs(ft.inputUtxos.map(toTsInput), 2),
    outputs,
    externalData,
    blindingSeed: ft.blindingSeed,
    outputTreeId: ft.outputTreeId,
  });
  const transact = await ctx.client.proveTransact(spp, settleAuthority(ctx, borrower.keypair));
  const proof = await circuitProof(ctx, "repay", built.proofInputs);
  const ix = await loanInstruction(ctx, {
    tag: TAG.REPAY,
    body: [proof, enc.encode(lender.solana), u64le(loanDataUtxo.data.deadline), new Uint8Array([lender.authorityBump])],
    transact,
    payer: borrower.solana,
    owners: [
      { address: lender.authority, signer: false },
      { address: borrower.solana, signer: true },
    ],
  });
  const sig = await sendInstruction(ix, borrower);
  const state = loadState();
  const loan = state.loans.find((l) => l.id === loanRecord.id);
  if (loan) {
    loan.status = "repaid";
    loan.txs.repay = sig;
  }
  saveState(state);
  return { sig, explorer: explorer(sig) };
}

export async function cancelOffer(lender, offerRecord) {
  const ctx = await getCtx();
  await withAuthority(lender);
  const offerWalletUtxo = walletUtxoFromRecord(offerRecord.utxo, offerRecord.principal);
  const dataUtxo = ctx.wasm.offerTermsDataUtxo(offerWalletUtxo);
  const built = ctx.wasm.cancelTransaction(
    {
      private: {
        txContext: { outputTreeId: 0 },
        terms: { ...dataUtxo.data, collateralMint: SOLM },
        offerUtxo: dataUtxo.utxo,
      },
      public: {
        expiry: dataUtxo.data.expiry,
        lenderOwnerPkField: beDec(lender.keypair.shieldedAddress().signingPublicKey.ownerProofInputHash()),
      },
    },
    lender.keypair.shieldedAddress().toBytes(),
    lender.solana,
  );
  const ft = built.finalizedTx;
  const outputs = toTsOutputs(ft);
  const { externalData } = await finalizeSpp(ctx, ft, outputs, lender.keypair, { senderOutputCount: 0 });
  const spp = new SppProofInputs({
    payer: ft.payer,
    inputUtxos: paddedInputs(ft.inputUtxos.map(toTsInput), 2),
    outputs,
    externalData,
    blindingSeed: ft.blindingSeed,
    outputTreeId: ft.outputTreeId,
  });
  const transact = await ctx.client.proveTransact(spp, settleAuthority(ctx, lender.keypair));
  const proof = await circuitProof(ctx, "cancel", built.proofInputs);
  const ix = await loanInstruction(ctx, {
    tag: TAG.CANCEL,
    body: [proof, u64le(dataUtxo.data.expiry), new Uint8Array([lender.authorityBump])],
    transact,
    payer: lender.solana,
    lenderSigner: lender.solana,
    owners: [{ address: lender.authority, signer: false }],
  });
  const sig = await sendInstruction(ix, lender);
  const state = loadState();
  const offer = state.offers.find((o) => o.id === offerRecord.id);
  if (offer) {
    offer.status = "cancelled";
    offer.txs.cancel = sig;
  }
  saveState(state);
  return { sig, explorer: explorer(sig) };
}

export async function claim(lender, loanRecord) {
  const ctx = await getCtx();
  await withAuthority(lender);
  const loanWalletUtxo = walletUtxoFromRecord(loanRecord.utxo, loanRecord.collateral);
  const loanDataUtxo = ctx.wasm.loanTermsDataUtxo(loanWalletUtxo);
  const built = ctx.wasm.claimTransaction(
    {
      private: {
        txContext: { outputTreeId: 0 },
        loanUtxo: loanDataUtxo.utxo,
        terms: { ...loanDataUtxo.data, principalMint: SOLM },
      },
      public: {
        deadline: loanDataUtxo.data.deadline,
        lenderOwnerPkField: beDec(lender.keypair.shieldedAddress().signingPublicKey.ownerProofInputHash()),
      },
    },
    lender.keypair.shieldedAddress().toBytes(),
    lender.solana,
  );
  const ft = built.finalizedTx;
  const outputs = toTsOutputs(ft);
  const { externalData } = await finalizeSpp(ctx, ft, outputs, lender.keypair, { senderOutputCount: 0 });
  const spp = new SppProofInputs({
    payer: ft.payer,
    inputUtxos: paddedInputs(ft.inputUtxos.map(toTsInput), 2),
    outputs,
    externalData,
    blindingSeed: ft.blindingSeed,
    outputTreeId: ft.outputTreeId,
  });
  const transact = await ctx.client.proveTransact(spp, settleAuthority(ctx, lender.keypair));
  const proof = await circuitProof(ctx, "claim", built.proofInputs);
  const ix = await loanInstruction(ctx, {
    tag: TAG.CLAIM,
    body: [proof, u64le(loanDataUtxo.data.deadline), new Uint8Array([lender.authorityBump])],
    transact,
    payer: lender.solana,
    lenderSigner: lender.solana,
    owners: [{ address: lender.authority, signer: false }],
  });
  const sig = await sendInstruction(ix, lender);
  const state = loadState();
  const loan = state.loans.find((l) => l.id === loanRecord.id);
  if (loan) {
    loan.status = "claimed";
    loan.txs.claim = sig;
  }
  saveState(state);
  return { sig, explorer: explorer(sig) };
}
