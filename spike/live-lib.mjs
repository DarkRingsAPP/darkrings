/* The live loan client library: everything the browser desk needs, proven on
   mainnet from Node first. Mirrors loan-sdk's flows over the TS SDK + the
   generated WASM builders. */
import { readFileSync } from "node:fs";
import {
  LocalKeys,
  NullifierKey,
  ShieldedAddress,
  ShieldedKeypair,
  SigningKey,
  Wallet,
  initializePoseidon,
  syncWallet,
} from "@heliuslabs/spr";
import { SprClient, SignedTeePolicy } from "@heliuslabs/spr/client";
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
} from "@heliuslabs/spr/transaction";
import { InstructionTag, encodeTransactInstructionData } from "@heliuslabs/spr/interface";
import { getNullifierPdaAccountsAsync } from "@heliuslabs/spr/instructions";
import { getTreeAddress } from "@heliuslabs/spr/addresses";
import { SHIELDED_POOL_PROGRAM_ID } from "@heliuslabs/spr";
import {
  createKeyPairSignerFromPrivateKeyBytes,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  signTransactionWithSigners,
} from "@solana/kit";

// Deep-path imports: not in the export map, but stable within the pinned version.
import { compileUnsignedTransaction } from "./node_modules/@heliuslabs/spr/dist/flows/compile.js";
import { decodeIndexedInputs, indexedRequestEnvelope } from "./node_modules/@heliuslabs/spr/dist/client/prover/indexed.js";
import { bytesField, poseidon } from "./node_modules/@heliuslabs/spr/dist/client/internal.js";
import { asField } from "./node_modules/@heliuslabs/spr/dist/client/prover/assembly.js";

export const LOAN_PROGRAM = "4j3MfrBtrhrLV4Lu7JpP5TqbAHbZY6AkLmMUaR3TZHfE";
export const TAG = { OFFER: 0, ORIGINATE: 1, REPAY: 2, CLAIM: 3, CANCEL: 4 };
export const enc = getAddressEncoder();

export async function makeCtx() {
  const K = process.env.HELIUS_API_KEY;
  if (!K) throw new Error("HELIUS_API_KEY missing");
  await initializePoseidon();
  const wasm = await import("../loan/target/zk/loan-program/wasm-node/loan_program.js");
  const debugFetch = process.env.DEBUG_PROVER === "1"
    ? async (...args) => {
        const res = await globalThis.fetch(...args);
        if (!res.ok) {
          const text = await res.clone().text().catch(() => "");
          console.log("PROVER HTTP", res.status, String(args[0]).slice(0, 90), "BODY:", text.slice(0, 500));
        }
        return res;
      }
    : undefined;
  const client = new SprClient({
    solanaRpcUrl: `https://mainnet.helius-rpc.com/?api-key=${K}`,
    indexerUrl: `https://mainnet.helius-rpc.com/v1/spr?api-key=${K}`,
    proverUrl: `https://mainnet.helius-rpc.com/v1/spr?api-key=${K}`,
    ...(process.env.NO_TEE === "1" ? {} : { proverTee: SignedTeePolicy.forNetwork("mainnet") }),
    priorityFeeLamports: 60_000n,
    ...(debugFetch ? { fetch: debugFetch } : {}),
  });
  const tree = await getTreeAddress(0);
  return { client, wasm, tree };
}

export async function makeActor(ctx, seed) {
  const keypair = ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(seed));
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  const wallet = new Wallet({ identity: keypair.shieldedAddress() });
  const keys = LocalKeys.fromKeypair(keypair, ctx.client.proofService);
  const solana = keypair.shieldedAddress().solanaAddress();
  const [authority, authorityBump] = await getProgramDerivedAddress({
    programAddress: LOAN_PROGRAM,
    seeds: ["loan_authority", enc.encode(solana)],
  });
  return { keypair, signer, wallet, keys, solana, authority, authorityBump };
}

export async function sync(ctx, actor) {
  await syncWallet({ client: ctx.client, wallet: actor.wallet, keys: actor.keys });
  return actor.wallet.utxos().filter((u) => !u.spent);
}

export const zeroNullifierKey = () => NullifierKey.fromSecret(new Uint8Array(31));

/** The wasm WalletUtxo shape from a TS wallet note. */
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

import { ShieldedPublicKey } from "@heliuslabs/spr";
export const SOL_MINT_ADDR = "11111111111111111111111111111111";

/** Generic conversions: wasm FinalizedTransaction slots -> TS proof types. */
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
    // Padding slot. A zero resolved tag means the builder used compact padding
    // (publishes hash 0 and owner tag 0); a named tag means a random dummy. A
    // non-compact pad with a zero tag names nobody, which the circuit rejects.
    const tag = padTag ?? o.ownerTag;
    const compact = !tag || Buffer.from(tag).every((b) => b === 0);
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

/** All outputs of a wasm FinalizedTransaction, pads named by its resolved tags. */
export function toTsOutputs(ft) {
  return ft.outputUtxos.map((o, i) => toTsOutput(o, o.ownerAddress ? undefined : ft.ownerTags?.[i]?.resolved));
}

export const beDec = (b) => {
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  return v.toString();
};

/**
 * Settle authority: fills the zero-key secret on program-owned inputs and the
 * actor's own secret on its inputs, then hands the witness to the prover.
 * Mirrors Rust's SettleAuthority over the indexed prover route.
 */
export function settleAuthority(ctx, actorKeypair) {
  const service = ctx.client.proofService;
  const keys = [zeroNullifierKey(), actorKeypair.nullifierKey()];
  const fill = (inputs) =>
    inputs.map((input) => {
      if (input.nullifierSecret !== undefined || input.isDummy !== 0n) return input;
      for (const key of keys) {
        const pk = bytesField(key.publicKey(), "nullifier public key");
        if (input.circuit.owner === poseidon([input.ownerPublicKeyHash, pk])) {
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

/** finalize-mirror: compose external data and SppProofInputs from a wasm FinalizedTransaction. */
export function finalizeSpp(ctx, ft, tsOutputs, senderKeypair, { messages = [], expiryUnixTs, senderOutputCount = 1 } = {}) {
  const senderResolved = senderKeypair.shieldedAddress().confidentialViewTag();
  const payerIsSender = Buffer.from(enc.encode(ft.payer)).equals(Buffer.from(senderResolved)) ||
    ft.payer === senderKeypair.shieldedAddress().solanaAddress();
  const senderTag = payerIsSender ? { kind: "account", index: 0 } : { kind: "inline", value: senderResolved };
  return Promise.resolve(
    LocalShieldedKeys.fromKeypair(senderKeypair).transactionKeys([
      { viewingPublicKey: senderKeypair.shieldedAddress().viewingPublicKey, firstNullifier: ft.firstNullifier },
    ]),
  ).then(([key]) => {
    const encrypted = encryptConfidentialTransfer(key, { outputs: tsOutputs, assets: new AssetRegistry() });
    const txOutputs = [];
    const resolvedTags = [];
    const realLength = encrypted.payload.find((p) => p)?.data.length ?? 0;
    tsOutputs.forEach((output, index) => {
      const slot = encrypted.payload[index];
      const utxoHash = output.hash(ft.outputTreeId);
      if (!slot) {
        // Padding slot. Trailing compact padding is left out of the external
        // data entirely (SPP reads the omitted tag as 0); a named dummy gets a
        // length-matched random body under the wasm's resolved tag.
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
  });
}

export function paddedInputs(inputs, shapeInputs = 2) {
  const padded = [...inputs];
  while (padded.length < shapeInputs) padded.push(ProofInputUtxo.dummy(undefined, 0));
  return padded;
}

/** The circuit proof over the wasm's flat witness inputs, compressed to 128 bytes. */
export function circuitProof(ctx, circuitName, flatInputs) {
  const read = (f) => readFileSync(new URL(`../loan/target/zk/loan-program/${circuitName}/${f}`, import.meta.url));
  const bundle = ctx.wasm.prove(read("circuit.xbc"), read("pk.bin"), flatInputs);
  const proof = ctx.wasm.compressedProgramProof(bundle.proof);
  if (proof.length !== 128) throw new Error(`proof not 128B: ${proof.length}`);
  return proof;
}

/** The loan instruction: tag + body + encoded transact, with the Rust account order. */
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
    { address: "11111111111111111111111111111111", role: 0 },
    { address: ctx.tree, role: 1 },
    ...nullifierPdas,
    ...owners.map(({ address, signer }) => ({ address, role: signer ? 2 : 0 })),
  ];
  return { programAddress: LOAN_PROGRAM, accounts, data };
}

export async function sendInstruction(ctx, ix, feePayerSigner) {
  const { value: blockhash } = await ctx.client.solanaRpc.getLatestBlockhash().send();
  const tx = compileUnsignedTransaction({
    feePayer: feePayerSigner.address,
    lifetime: blockhash,
    instructions: [ix],
    computeUnitLimit: 1_400_000,
    priorityFeeLamports: 100_000n,
  });
  const signed = await signTransactionWithSigners([feePayerSigner], tx);
  const wire = getBase64EncodedWireTransaction(signed);
  const sig = getSignatureFromTransaction(signed);
  const started = Date.now();
  let lastErr;
  while (Date.now() - started < 90_000) {
    try {
      await ctx.client.solanaRpc.sendTransaction(wire, { encoding: "base64", skipPreflight: true, maxRetries: 0n }).send();
    } catch (e) {
      lastErr = e;
    }
    const { value } = await ctx.client.solanaRpc.getSignatureStatuses([sig]).send();
    const st = value?.[0];
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      if (st.err) throw new Error(`on-chain error: ${JSON.stringify(st.err)} sig ${sig}`);
      return sig;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw lastErr ?? new Error(`never confirmed: ${sig}`);
}

export async function waitForLeaf(ctx, utxoHash) {
  const started = Date.now();
  let last;
  while (Date.now() - started < 180_000) {
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

export { Data, ProofInputUtxo, SppProofInputs, Utxo, createProofOutput, decodeConfidential, ShieldedAddress, NullifierKey };
