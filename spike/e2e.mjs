/* DarkRings feasibility spike — Rings E2E on devnet.
   Flow: 2 wallets → register → deposit → private transfer → read encrypted
   balance → withdraw. Go/no-go criterion #1. */
import {
  createKeyPairSignerFromPrivateKeyBytes,
  getSignatureFromTransaction,
  signTransactionWithSigners,
  getBase64EncodedWireTransaction,
} from "@solana/kit";
import {
  LocalKeys,
  ShieldedKeypair,
  SigningKey,
  SOL_MINT,
  Wallet,
  buildDepositTransaction,
  buildRegistrationTransaction,
  buildSetMergeEncryptionTransaction,
  buildTransferTransaction,
  buildWithdrawalTransaction,
  getPrivateTransactions,
  syncWallet,
  formatAmount,
  initializePoseidon,
} from "@heliuslabs/spr";
import { SprClient, SignedTeePolicy } from "@heliuslabs/spr/client";
import { randomBytes } from "node:crypto";

const API_KEY = process.env.HELIUS_API_KEY;
if (!API_KEY) throw new Error("HELIUS_API_KEY missing");

// Rings is live on mainnet; devnet faucets are captcha-gated, so the spike
// runs on mainnet with dust amounts funded by FUNDER_SECRET (swept back after).
const RPC = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;
// unified Helius /v1/spr base serves both the Photon indexer and the prover
const INDEXER = `https://mainnet.helius-rpc.com/v1/spr?api-key=${API_KEY}`;
const PROVER = INDEXER;
const NETWORK = "mainnet";

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

await initializePoseidon();

const client = new SprClient({
  solanaRpcUrl: RPC,
  indexerUrl: INDEXER,
  proverUrl: PROVER,
  proverTee: SignedTeePolicy.forNetwork(NETWORK),
  priorityFeeLamports: 60_000n, // whole-tx priority fee so proofs land on mainnet
});

// ---- actors: lender + borrower, each one seed for Solana signer + shielded keys
// Seeds persist to disk so a failed run never strands funds in a lost wallet.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
async function makeActor(name) {
  const seedFile = new URL(`./.seed-${name}`, import.meta.url);
  let seed;
  if (existsSync(seedFile)) seed = readFileSync(seedFile);
  else {
    seed = randomBytes(32);
    writeFileSync(seedFile, seed, { mode: 0o600 });
  }
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  const keypair = ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(seed));
  const wallet = new Wallet({ identity: keypair.shieldedAddress() });
  const keys = LocalKeys.fromKeypair(keypair, client.proofService);
  log(`${name}: ${signer.address}`);
  return { name, signer, keypair, wallet, keys };
}

async function submit(tx, signers) {
  const signed = await signTransactionWithSigners(signers, tx);
  const wire = getBase64EncodedWireTransaction(signed);
  const sig = getSignatureFromTransaction(signed);
  // mainnet: keep resending the same wire until it lands or the blockhash dies
  const started = Date.now();
  let lastErr;
  while (Date.now() - started < 75_000) {
    try {
      await client.solanaRpc.sendTransaction(wire, { encoding: "base64", skipPreflight: true, maxRetries: 0n }).send();
    } catch (e) { lastErr = e; }
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

// ---- funder: mainnet dust comes from FUNDER_SECRET and goes back at the end
import bs58 from "bs58";
import { getTransferSolInstruction } from "@solana-program/system";
import { getSetComputeUnitPriceInstruction } from "@solana-program/compute-budget";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { pipe, createTransactionMessage, setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions, compileTransaction } from "@solana/kit";

const funderSecret = process.env.FUNDER_SECRET;
if (!funderSecret) throw new Error("FUNDER_SECRET missing");
const funder = await createKeyPairSignerFromBytes(bs58.decode(funderSecret));
log(`funder: ${funder.address}`);

async function buildPlainTx(feePayerSigner, instructions) {
  const { value: blockhash } = await client.solanaRpc.getLatestBlockhash().send();
  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayerSigner, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(
      [getSetComputeUnitPriceInstruction({ microLamports: 150_000n }), ...instructions], m),
    compileTransaction
  );
}

async function fund(toAddr, lamports) {
  const { value: have } = await client.solanaRpc.getBalance(toAddr).send();
  if (BigInt(have) >= BigInt(lamports)) {
    log(`fund skip: ${toAddr.slice(0, 6)}… already holds ${Number(have) / 1e9} SOL`);
    return;
  }
  const need = BigInt(lamports) - BigInt(have);
  const { value: fb } = await client.solanaRpc.getBalance(funder.address).send();
  if (BigInt(fb) < need + 900_000n + 5_000n)
    throw new Error(`funder too poor: holds ${Number(fb) / 1e9} SOL, needs ${Number(need) / 1e9} + rent buffer. Top up ${funder.address}`);
  const tx = await buildPlainTx(funder, [
    getTransferSolInstruction({ source: funder, destination: toAddr, amount: need }),
  ]);
  await submit(tx, [funder]);
  log(`fund ${Number(need) / 1e9} SOL → ${toAddr.slice(0, 6)}…  ok`);
}

const lender = await makeActor("lender");
const borrower = await makeActor("borrower");

// ---- fund with dust (mainnet)
await fund(lender.signer.address, 6_200_000); // 0.0062 SOL (dust budget)
await fund(borrower.signer.address, 3_200_000); // 0.0032 SOL

// ---- register both shielded wallets
for (const a of [lender, borrower]) {
  const tx = await buildRegistrationTransaction({
    client,
    owner: a.signer.address,
    address: a.keypair.shieldedAddress(),
  });
  if (tx) {
    const { sig } = await submit(tx, [a.signer]);
    log(`${a.name} registered  ${sig.slice(0, 16)}…`);
  } else log(`${a.name} already registered`);
  const mtx = await buildSetMergeEncryptionTransaction?.({ client, owner: a.signer.address, keys: a.keys, wallet: a.wallet }).catch(() => null);
  if (mtx) {
    await submit(mtx, [a.signer]).catch((e) => log(`${a.name} merge-enc skipped: ${e.message?.slice(0, 80)}`));
  }
}

// ---- lender deposits 0.0025 SOL into the ring (skipped when already in)
await syncWallet({ client, wallet: lender.wallet, keys: lender.keys });
if (lender.wallet.balance(SOL_MINT).amount < 2_000_000n) {
  const dep = await buildDepositTransaction({
    client,
    feePayer: lender.signer.address,
    recipient: lender.keypair.shieldedAddress(),
    amount: 2_500_000n,
  });
  const { sig: depSig, slot: depSlot } = await submit(dep, [lender.signer]);
  log(`deposit 0.0025 SOL → ring  ${depSig.slice(0, 16)}…`);
  await syncWallet({ client, wallet: lender.wallet, keys: lender.keys, config: { requireSlot: depSlot } });
} else log("deposit skip: already funded privately");
log(`lender private balance: ${formatAmount(lender.wallet.balance(SOL_MINT).amount, 9)} SOL (encrypted on-chain)`);

// ---- private transfer lender → borrower (the "loan principal" leg), 0.008 SOL
const xfer = await buildTransferTransaction({
  client,
  wallet: lender.wallet,
  keys: lender.keys,
  feePayer: lender.signer.address,
  recipient: borrower.signer.address, // Solana address → resolved via registry
  amount: 1_000_000n,
});
const { sig: xferSig, slot: xferSlot } = await submit(xfer, [lender.signer]);
log(`PRIVATE transfer 0.001 SOL lender→borrower  ${xferSig.slice(0, 16)}…  (amount encrypted)`);

await syncWallet({ client, wallet: lender.wallet, keys: lender.keys, config: { requireSlot: xferSlot } });
await syncWallet({ client, wallet: borrower.wallet, keys: borrower.keys, config: { requireSlot: xferSlot } });
log(`lender private balance now:   ${formatAmount(lender.wallet.balance(SOL_MINT).amount, 9)} SOL`);
log(`borrower private balance now: ${formatAmount(borrower.wallet.balance(SOL_MINT).amount, 9)} SOL`);

// ---- borrower withdraws 0.0004 SOL to public
const wd = await buildWithdrawalTransaction({
  client,
  wallet: borrower.wallet,
  keys: borrower.keys,
  feePayer: borrower.signer.address,
  recipient: borrower.signer.address,
  amount: 400_000n,
});
const { sig: wdSig, slot: wdSlot } = await submit(wd, [borrower.signer]);
log(`withdraw 0.0004 SOL → public  ${wdSig.slice(0, 16)}…`);

await syncWallet({ client, wallet: borrower.wallet, keys: borrower.keys, config: { requireSlot: wdSlot } });
log(`borrower private balance after withdraw: ${formatAmount(borrower.wallet.balance(SOL_MINT).amount, 9)} SOL`);
log(`borrower private history: ${getPrivateTransactions(borrower.wallet).length} txs`);
log("E2E COMPLETE ✅  explorer:", `https://explorer.solana.com/tx/${xferSig}`);

// ---- cleanup: every remaining private + public lamport goes back to the
// funder, who also pays every cleanup fee so small accounts can empty to zero
for (const a of [lender, borrower]) {
  await syncWallet({ client, wallet: a.wallet, keys: a.keys });
  const left = a.wallet.balance(SOL_MINT).amount;
  if (left > 0n) {
    const tx = await buildWithdrawalTransaction({
      client, wallet: a.wallet, keys: a.keys,
      feePayer: funder.address, recipient: funder.address, amount: left,
    });
    await submit(tx, [funder, a.signer]);
    log(`${a.name} private remainder ${formatAmount(left, 9)} SOL → funder`);
  }
  const { value: pub } = await client.solanaRpc.getBalance(a.signer.address).send();
  if (BigInt(pub) > 0n) {
    const tx = await buildPlainTx(funder, [
      getTransferSolInstruction({ source: a.signer, destination: funder.address, amount: BigInt(pub) }),
    ]);
    await submit(tx, [funder, a.signer]);
    log(`${a.name} public remainder ${formatAmount(BigInt(pub), 9)} SOL → funder`);
  }
}
const { value: fb } = await client.solanaRpc.getBalance(funder.address).send();
log(`CLEANUP DONE — funder holds ${formatAmount(BigInt(fb), 9)} SOL`);
