/* Session actors for the live desk. One 32-byte seed per role, generated on
   this device and kept in localStorage: the Solana signer and the shielded
   keypair both derive from it, and it never leaves the browser. */
import {
  createKeyPairSignerFromPrivateKeyBytes,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  signTransactionWithSigners,
} from "@solana/kit";
import { LocalKeys, ShieldedKeypair, SigningKey, Wallet } from "@heliuslabs/spr";
import { getClient } from "./client.js";

const KEY = (role) => `darkrings.live.seed.${role}`;

const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (s) => Uint8Array.from(s.match(/.{2}/g).map((x) => parseInt(x, 16)));

export function hasSeed(role) {
  try {
    return Boolean(localStorage.getItem(KEY(role)));
  } catch {
    return false;
  }
}

function loadSeed(role) {
  let hex = null;
  try {
    hex = localStorage.getItem(KEY(role));
  } catch {
    /* private windows: ephemeral session */
  }
  if (hex) return fromHex(hex);
  const seed = crypto.getRandomValues(new Uint8Array(32));
  try {
    localStorage.setItem(KEY(role), toHex(seed));
  } catch {
    /* keep it in memory only */
  }
  return seed;
}

/** The seed as hex, for the user's own backup. */
export function exportSeed(role) {
  try {
    return localStorage.getItem(KEY(role));
  } catch {
    return null;
  }
}

/** Restores a session wallet from a backed-up 32-byte hex seed. */
export function importSeed(role, hexSeed) {
  const t = String(hexSeed ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(t)) throw new Error("a session key is 64 hex characters");
  localStorage.setItem(KEY(role), t);
}

/** The injected Solana wallet provider, when one exists. */
export function walletProvider() {
  const p = window.phantom?.solana ?? window.solflare ?? window.solana;
  return p && typeof p.signMessage === "function" ? p : null;
}

/**
 * Derives the session seed from one wallet signature: ed25519 signatures are
 * deterministic, so the same wallet re-derives the same keys forever. The
 * wallet's own private key never leaves the extension; only the signature of
 * this fixed, legible message is hashed. The Elusiv and zk.money pattern.
 */
export async function deriveSeedFromWallet(role) {
  const provider = walletProvider();
  if (!provider) throw new Error("no Solana wallet extension found in this browser");
  await provider.connect();
  const message = new TextEncoder().encode(
    `DarkRings session key v1\nrole: ${role}\n\nSigning this derives the private keys of your ${role} session at darkrings.app. Sign it nowhere else.`,
  );
  const signed = await provider.signMessage(message, "utf8");
  const signature = signed.signature ?? signed;
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(signature));
  const seed = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(KEY(role), seed);
  return seed;
}

export async function makeActor(role) {
  const client = await getClient();
  const seed = loadSeed(role);
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  const keypair = ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(seed));
  const wallet = new Wallet({ identity: keypair.shieldedAddress() });
  const keys = LocalKeys.fromKeypair(keypair, client.proofService);
  return { role, seed, signer, keypair, wallet, keys };
}

/** Sign with `signers` and resend the same wire until it confirms. */
export async function submit(tx, signers) {
  const client = await getClient();
  const signed = await signTransactionWithSigners(signers, tx);
  const wire = getBase64EncodedWireTransaction(signed);
  const sig = getSignatureFromTransaction(signed);
  const started = Date.now();
  let lastErr;
  while (Date.now() - started < 90_000) {
    try {
      await client.solanaRpc
        .sendTransaction(wire, { encoding: "base64", skipPreflight: true, maxRetries: 0n })
        .send();
    } catch (e) {
      lastErr = e;
    }
    const { value } = await client.solanaRpc.getSignatureStatuses([sig]).send();
    const st = value?.[0];
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      if (st.err) throw new Error(`tx failed on-chain: ${JSON.stringify(st.err, (k, v) => (typeof v === "bigint" ? String(v) : v))}`);
      return { sig, slot: BigInt(st.slot) };
    }
    await new Promise((s) => setTimeout(s, 2000));
  }
  throw lastErr ?? new Error(`tx never confirmed: ${sig}`);
}
