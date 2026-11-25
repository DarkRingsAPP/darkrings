/* tslint:disable */
/* eslint-disable */

/** A binary payload: a `Uint8Array`, or a raw `ArrayBuffer` */
export type Bytes = Uint8Array | ArrayBuffer;



export interface ProgramInputRecords {
    inputs: WalletUtxo[];
    addresses: number[][];
    mints?: Mint[];
}
export interface ProofInputContext {
    blindingSeed: Uint8Array;
    outputTreeId?: number | null;
}
export type SnarkjsG1 = [string, string, string];
export type SnarkjsG2 = [[string, string], [string, string], [string, string]];
export interface SnarkjsProof {
    protocol: "groth16";
    curve: "bn128";
    pi_a: SnarkjsG1;
    pi_b: SnarkjsG2;
    pi_c: SnarkjsG1;
}
export interface SnarkjsVerifyingKey {
    protocol: "groth16";
    curve: "bn128";
    nPublic: number;
    vk_alpha_1: SnarkjsG1;
    vk_beta_2: SnarkjsG2;
    vk_gamma_2: SnarkjsG2;
    vk_delta_2: SnarkjsG2;
    IC: SnarkjsG1[];
}


/**
 * A decrypted note with indexer context. Missing data hashes require reconstruction.
 *
 * `Debug` is written by hand so a log line never prints
 * [`Self::tx_viewing_key`].
 */
export interface WalletUtxo {
    utxo: Utxo;
    /**
     * The owner's nullifier pubkey, which [`Self::utxo_hash`] folds in through
     * `owner_hash`. Kept so converting to an input needs no address lookup.
     */
    nullifierPubkey: Uint8Array;
    /**
     * Published commitment, checked by `verify_spendable` or transaction construction.
     */
    utxoHash: Uint8Array;
    /**
     * The spend marker, computed while the key was in hand.
     */
    nullifier: Uint8Array;
    txViewingKey?: Uint8Array;
    dataHash?: Uint8Array;
    ringDataHash?: Uint8Array;
    /**
     * Tree ID used in commitment verification.
     */
    treeId: number;
    /**
     * Position of `utxo_hash` in its tree, which the inclusion proof is
     * fetched by.
     */
    leafIndex: bigint;
    /**
     * The newest unpaused tree the indexer knew when it returned this UTXO
     * (the `output_tree_id` of the page it came from): where a transaction
     * that spends it appends its outputs unless the builder is told another
     * tree. A sync stamps it with
     * [`SpendableDecryptionResult::with_latest_tree_id`](crate::SpendableDecryptionResult::with_latest_tree_id).
     * `None` until the indexer reports one; a transaction spending it then
     * keeps the default output tree 0.
     */
    latestTreeId?: number;
    /**
     * Where it was published. Ordering, history rows and re-fetch by signature
     * read these.
     */
    slot?: bigint;
    txSignature?: Uint8Array;
    slotIndex?: number;
}

/**
 * A mint address used in commitments and its compact ID used in payloads.
 */
export interface Mint {
    asset: string;
    assetId: bigint;
}

/**
 * An input UTXO with every value the transaction and the prover read from it
 * already computed, so nothing downstream holds key material. Convert from
 * [`WalletUtxo`](crate::WalletUtxo) when finalizing a transaction.
 */
export interface SppProofInputUtxo {
    /**
     * Reserves an address by proving non-inclusion, without spending a state leaf.
     */
    address?: boolean;
    /**
     * Includes the resolved [`Mint`], carrying both the address and compact ID.
     */
    utxo: Utxo;
    /**
     * The owner's nullifier pubkey, which the commitment folds in through
     * `owner_hash`. Padding carries zeros: a dummy commits to no owner.
     */
    nullifierPubkey: Uint8Array;
    /**
     * Commitment under [`Self::tree_id`].
     */
    utxoHash: Uint8Array;
    /**
     * The nullifier the circuit derives for this slot and proves absent from
     * the nullifier tree. Compact padding keeps its derived value here and
     * publishes 0 instead; see [`Self::published_nullifier`].
     */
    nullifier: Uint8Array;
    dataHash?: Uint8Array;
    ringDataHash?: Uint8Array;
    /**
     * Raw id of the tree this UTXO is spent from. Both [`Self::utxo_hash`] and
     * [`Self::nullifier`] fold it in, so it must match the tree the inclusion
     * proof comes from, and a later change to it invalidates both.
     *
     * The indexer reports it with the slot that published the commitment, and
     * a [`WalletUtxo`](crate::WalletUtxo) carries it from there. Where a
     * tree account is needed, it is `pda::tree(tree_id)`.
     */
    treeId: number;
    /**
     * Position of the commitment in its tree. Unused for dummy inputs.
     */
    leafIndex: bigint;
    cacheSlot?: number;
    /**
     * Compact padding: a dummy the instruction leaves out. It publishes
     * nullifier 0, and SPP creates nothing for it, while the circuit still
     * proves its derived nullifier absent from the tree.
     */
    compact?: boolean;
}

/**
 * Client-selected output tree and optional reproducible transaction blinding.
 */
export interface TransactionOptions {
    blindingSeed?: Uint8Array;
    outputTreeId?: number;
}

/**
 * One ordered interface transfer, including the accounts committed by the
 * canonical external-data hash. SPL legs retain their mint so proof public
 * transfers can be derived without inspecting private inputs or outputs.
 */
export type SettlementTransfer = { kind: "sol"; isDeposit: boolean; amount: bigint; userSolAccount: string } | { kind: "spl"; mint: string; isDeposit: boolean; amount: bigint; userSplToken: string };

/**
 * The application proof carried by an instruction: compressed A, B and C.
 */
export interface CompressedProof {
    a: Uint8Array;
    b: Uint8Array;
    c: Uint8Array;
}

/**
 * The loan terms, the loan UTXO's state (`DataUtxo<LoanTerms>`). The loan
 * UTXO holds the locked collateral; its asset and amount are the
 * collateral's. Encrypted to the lender's viewing key, so the lender
 * discovers its open loans; the borrower holds the opening from building
 * the originate transaction.
 */
export interface LoanTerms {
    /**
     * The repayment's mint: the principal the borrower received.
     */
    principalMint: Asset;
    /**
     * What the borrower repays to reclaim the collateral.
     */
    repayAmount: bigint;
    /**
     * Receives the repayment at repay, or the collateral at claim.
     */
    lender: UtxoOwner;
    /**
     * Receives the collateral back at repay; owned the collateral input.
     */
    borrower: UtxoOwner;
    /**
     * Unix seconds; repay requires `now <= deadline`, claim `now > deadline`.
     */
    deadline: bigint;
}

/**
 * The offer terms, the offer UTXO's state (`DataUtxo<OfferTerms>`). The
 * offer UTXO holds the locked principal; its asset and amount are the
 * principal's. The SDK hashes the terms into the data hash and encrypts
 * them as the offer UTXO's data (to the borrower's viewing key, so the
 * designated borrower discovers the offer).
 */
export interface OfferTerms {
    /**
     * The mint the borrower must post as collateral.
     */
    collateralMint: Asset;
    collateralAmount: bigint;
    /**
     * What the borrower repays (principal + interest), in the principal's
     * mint, to reclaim the collateral before `deadline`.
     */
    repayAmount: bigint;
    /**
     * Unix seconds; the absolute repay-by time of the loan once originated.
     */
    deadline: bigint;
    /**
     * The lender, the owner of the source the offer spends: receives the
     * repayment, claims the collateral on default, reclaims the principal on
     * cancel, and its signing key signs the cancel.
     */
    lender: UtxoOwner;
    /**
     * Unix seconds; the offer's own expiry. Revealed at originate and cancel
     * and checked against the Clock by the program.
     */
    expiry: bigint;
    /**
     * The designated borrower's owner identity (`solana_owner_identity` of
     * its Solana address) as 32 big-endian bytes, or zero for an offer
     * anyone holding the opening may originate.
     */
    borrowerPkFe: Uint8Array;
}

export interface Cancel {
    private: CancelPrivateInputsClient;
    public: CancelPublicInputsClient;
}

export interface CancelPrivateInputsClient {
    txContext: TransactionOptions;
    terms: OfferTermsClient;
    offerUtxo: WalletUtxo;
}

export interface CancelPublicInputsClient {
    expiry: bigint;
    lenderOwnerPkField: string;
}

export interface Claim {
    private: ClaimPrivateInputsClient;
    public: ClaimPublicInputsClient;
}

export interface ClaimPrivateInputsClient {
    txContext: TransactionOptions;
    loanUtxo: WalletUtxo;
    terms: LoanTermsClient;
}

export interface ClaimPublicInputsClient {
    deadline: bigint;
    lenderOwnerPkField: string;
}

export interface Data {
    records: DataRecord[];
}

export interface DataUtxo<T> {
    utxo: WalletUtxo;
    data: T;
    address?: Uint8Array;
}

export interface FinalizedTransaction {
    inputUtxos: SppProofInputUtxo[];
    outputUtxos: SppProofOutputUtxo[];
    outputHashes: Uint8Array[];
    ownerTags: ResolvedOwnerTag[];
    interfaceTransfers: SettlementTransfer[];
    firstNullifier: Uint8Array;
    blindingSeed: Uint8Array;
    privateTxBlinding: Uint8Array;
    paddingIndependentPrivateTxHash: Uint8Array;
    outputTreeId: number;
    payer: string;
    sender: ShieldedAddress;
}

export interface LoanTermsClient {
    principalMint: Mint;
    repayAmount: bigint;
    lender: UtxoOwner;
    borrower: UtxoOwner;
    deadline: bigint;
}

export interface Offer {
    private: OfferPrivateInputsClient;
    public: OfferPublicInputsClient;
}

export interface OfferPrivateInputsClient {
    txContext: TransactionOptions;
    source: WalletUtxo;
    principalAmount: bigint;
    collateralMint: Mint;
    collateralAmount: bigint;
    repayAmount: bigint;
    deadline: bigint;
    expiry: bigint;
    borrowerPkFe: number[];
}

export interface OfferPublicInputsClient {
    lenderOwnerPkField: string;
    offerOwner: Uint8Array;
}

export interface OfferTermsClient {
    collateralMint: Mint;
    collateralAmount: bigint;
    repayAmount: bigint;
    deadline: bigint;
    lender: UtxoOwner;
    expiry: bigint;
    borrowerPkFe: number[];
}

export interface Originate {
    private: OriginatePrivateInputsClient;
    public: OriginatePublicInputsClient;
}

export interface OriginatePrivateInputsClient {
    txContext: TransactionOptions;
    terms: OfferTermsClient;
    offerUtxo: WalletUtxo;
    collateralIn: WalletUtxo;
}

export interface OriginatePublicInputsClient {
    expiry: bigint;
    firstNullifier: string;
    loanOwner: Uint8Array;
}

export interface ProgramProof {
    publicInputs: [Uint8Array];
    compressedProof: CompressedProof;
}

export interface ProgramTransaction {
    finalizedTx: FinalizedTransaction;
    proofInputs: Record<string, string>;
    publicHash: Uint8Array;
}

export interface Repay {
    private: RepayPrivateInputsClient;
    public: RepayPublicInputsClient;
}

export interface RepayPrivateInputsClient {
    txContext: TransactionOptions;
    terms: LoanTermsClient;
    loanUtxo: WalletUtxo;
    repayIn: WalletUtxo;
    lenderAddress: Uint8Array;
}

export interface RepayPublicInputsClient {
    deadline: bigint;
    firstNullifier: string;
}

export interface ResolvedOwnerTag {
    tag: OwnerTag;
    resolved: Uint8Array;
}

export interface SigningPubkey {
    tag: number;
    bytes: Uint8Array;
}

export interface SppProofOutputUtxo {
    asset: Mint;
    amount: bigint;
    blinding: Uint8Array;
    ringProgramId?: string;
    ringDataHash?: Uint8Array;
    dataHash?: Uint8Array;
    ownerAddress?: ShieldedAddress;
    ownerTag?: Uint8Array;
    data?: Data;
    cacheSlot?: number;
    /**
     * Compact padding: a dummy that publishes hash 0, so the instruction leaves
     * it out and SPP appends nothing for it.
     */
    compact?: boolean;
}

export interface Utxo {
    owner: PublicKey;
    /**
     * The resolved mint. Commitments use its address; payloads use its ID.
     */
    asset: Mint;
    amount: bigint;
    blinding: Uint8Array;
    ringProgramId?: string;
    data?: Data;
}

export interface UtxoOwner {
    key: SigningPubkey;
    nullifierPk: string;
}

export type DataRecord = { kind: "ringData"; bytes: Uint8Array } | { kind: "utxoData"; bytes: Uint8Array } | { kind: "memo"; bytes: Uint8Array };

export type OwnerTag = { kind: "inline"; value: Uint8Array } | { kind: "account"; index: number };

export type PublicKey = Uint8Array;

export type ShieldedAddress = Uint8Array;


/**
 * Re-encodes a proving key with uncompressed points as it streams through:
 * `push(chunk)` returns the output produced so far. Store the result (OPFS,
 * IndexedDB, Cache API) and prove from it next time — every point read then
 * skips its square root, the dominant cost of a WASM proof. See
 * `js/stream.mjs` `transcodeKey`.
 */
export class KeyTranscoder {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Feed the next bytes of `pk.bin`; returns the uncompressed bytes produced.
     */
    push(chunk: Uint8Array): Uint8Array;
    /**
     * Whether the whole key has been read.
     */
    readonly complete: boolean;
}

/**
 * The result of [`prove`] / [`prove_preloaded`]: the canonical compressed
 * proof + public-input bytes (identical to the host's `proof.bin` /
 * `public_inputs.bin`), plus the public-input count.
 */
export class ProofBundle {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Number of public inputs.
     */
    numPublicInputs: number;
    /**
     * Canonical compressed proof bytes (`== proof.bin`).
     */
    proof: Uint8Array;
    /**
     * Canonical compressed public-input bytes (`== public_inputs.bin`).
     */
    publicInputs: Uint8Array;
}

/**
 * A circuit's `circuit.xbc` and `pk.bin`, parsed and decoded once, for many proofs:
 * what [`preload`] caches, as an object of its own, so each prover keeps its own.
 * The key is decoded into wasm memory (about 2.2× `pk.bin`), so a proof skips the
 * `.xbc` parse, row-source build and point decompression [`prove`] does each time.
 * `sources`: as for [`prove`].
 */
export class ProvingSession {
    free(): void;
    [Symbol.dispose](): void;
    constructor(circuit_xbc: Bytes, pk_bytes: Bytes, sources?: string | null);
    /**
     * Prove: the same arguments (bar the artifacts) and result as [`prove`].
     * `options` (optional): `pool`, a worker pool from `js/pool.mjs`, as for
     * `proveStreaming`.
     */
    prove(inputs: any, options: any): ProofBundle;
}

/**
 * A circuit's `schema.json`, parsed once: what a generated client holds to encode
 * and decode values, instead of passing the text to every call.
 */
export class Schema {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * As [`decode_public_values`].
     */
    decodePublicValues(public_inputs_bytes: Bytes): string;
    /**
     * As [`encode_inputs`].
     */
    encodeInputs(inputs_json: string): any;
    /**
     * As [`encode_public_inputs`].
     */
    encodePublicInputs(public_json: string): Uint8Array;
    /**
     * Parse `schema.json` (text). Throws if it isn't a schema this xark reads.
     */
    constructor(schema_json: string);
    /**
     * As [`value_fields`].
     */
    valueFields(type_name: string, value_json: string): string[];
}

/**
 * A proof waiting for proving-key bytes: created by [`begin_streaming_proof`],
 * fed with [`push`](Self::push) (e.g. each chunk of a `fetch` body), completed
 * with [`finish`](Self::finish). The key is never held — each chunk of points is
 * folded into its MSM and dropped — and the witness and quotient are computed
 * before the first byte is needed, so proving overlaps the download.
 */
export class StreamingProof {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Assemble and self-verify the proof (after the whole key has been pushed).
     */
    finish(): ProofBundle;
    /**
     * Feed the next bytes of `pk.bin` (any chunk size, in order).
     */
    push(chunk: Uint8Array): void;
    /**
     * Whether the whole key has arrived.
     */
    readonly complete: boolean;
    /**
     * Proving-key bytes consumed so far.
     */
    readonly received: number;
}

/**
 * A verifying key (`vk.bin`), decoded once: a malformed key throws here, so that
 * [`VerifyingKey::verify`](JsVerifyingKey::verify) throws only on a malformed proof
 * or public inputs.
 */
export class VerifyingKey {
    free(): void;
    [Symbol.dispose](): void;
    constructor(vk_bytes: Bytes);
    /**
     * As [`verify`], with this key.
     */
    verify(proof_bytes: Bytes, public_inputs_bytes: Bytes): boolean;
}

/**
 * Start transcoding. `options.pool` decompresses on the worker pool.
 */
export function beginKeyTranscode(options: any): KeyTranscoder;

/**
 * Start a push-driven proof. `options` as for [`prove_streaming`] (`r1cs`,
 * `pool`, `msmChunk`, `seed`), except that `r1cs` is required for a `minimized`
 * key: the rows are needed before the key arrives.
 */
export function beginStreamingProof(circuit_xbc: Bytes, inputs: any, options: any): StreamingProof;

export function cancelTransaction(inputs: Cancel, sender: Uint8Array, payer: string): ProgramTransaction;

/**
 * Validate exact proving-key bytes against a SHA-256 pin from trusted build metadata.
 */
export function checkProvingKey(proving_key: Uint8Array, expected_sha256?: Uint8Array | null): void;

/**
 * The circuit digest of a `circuit.xbc` (what `xark build` prints, and a key's
 * `metadata.json` records): the same for every build of the circuit, whichever Rust
 * compiled it, and different for any other circuit.
 */
export function circuitDigest(circuit_xbc: Bytes): string;

export function claimTransaction(inputs: Claim, sender: Uint8Array, payer: string): ProgramTransaction;

export function compressedProgramProof(proof: Uint8Array): Uint8Array;

/**
 * Canonical public-input bytes decoded to their natural forms: JSON text of an
 * object keyed `camelCase` (a time as an ISO 8601 date or date-time, flags as their names, bytes
 * as `0x`-hex, field elements as decimal strings).
 */
export function decodePublicValues(schema_json: string, public_inputs_bytes: Bytes): string;

/**
 * Decode binary public inputs (the `publicInputs` `Uint8Array` from [`prove`],
 * == `public_inputs.bin`) to decimal strings, in proof order.
 */
export function decode_public_inputs(public_inputs_bytes: Bytes): string[];

/**
 * The circuit's inputs (JSON text: an object of every input, each in its natural
 * form, `camelCase` or `snake_case` keys) as the `leaf → decimal` object [`prove`]
 * takes, encoded and checked against `schema` (the circuit's `schema.json` text).
 * A generated client holds a [`Schema`](JsSchema) instead.
 */
export function encodeInputs(schema_json: string, inputs_json: string): any;

/**
 * The public inputs (JSON text, as for [`encode_inputs`]; only the public ones
 * needed) as the canonical bytes [`verify`] takes (`public_inputs.bin`).
 */
export function encodePublicInputs(schema_json: string, public_json: string): Uint8Array;

/**
 * Worker kernel: a row-major `N1 × b` column tile at column `c0`.
 * `op`: 0 = inverse + twiddle·(1/N), 1 = twiddle + forward.
 */
export function kernel_cols(block: Uint8Array, n1: number, n2: number, c0: number, op: number): void;

/**
 * Worker kernel: re-encode compressed points uncompressed.
 */
export function kernel_decompress(g2: boolean, points: Uint8Array): Uint8Array;

/**
 * Worker kernel: MSM over serialized points and 32-byte LE scalars; returns the
 * uncompressed affine sum.
 */
export function kernel_msm(g2: boolean, points: Uint8Array, compressed: boolean, scalars: Uint8Array): Uint8Array;

/**
 * Worker kernel: whole rows `[first_row, …)` of a coset transform chain.
 */
export function kernel_rows(rows: Uint8Array, n1: number, n2: number, first_row: number, to_coset: boolean): void;

export function loanTermsDataUtxo(utxo: WalletUtxo): DataUtxo<LoanTerms>;

export function offerTermsDataUtxo(utxo: WalletUtxo): DataUtxo<OfferTerms>;

export function offerTransaction(inputs: Offer, sender: Uint8Array, payer: string): ProgramTransaction;

export function originateTransaction(inputs: Originate, sender: Uint8Array, payer: string): ProgramTransaction;

/**
 * `xark_poseidon2::hash` of field elements (decimal or `0x`-hex strings, each
 * below the field order), as a decimal string: the value the gadget constrains.
 */
export function poseidon2(inputs: string[]): string;

/**
 * Parse and cache a circuit's `circuit.xbc` + `pk.bin` once for
 * [`prove_preloaded`]. Call once per circuit; subsequent calls silently
 * replace the cached state.
 *
 * `circuit_xbc` is the self-contained binary artifact `xark build` always
 * writes; `pk_bytes` is the `pk.bin` from `xark setup`. The key is decoded once
 * into wasm memory (about 2.2× its compressed size) so repeat proofs skip point
 * decompression; for the largest circuits prefer `preloadStreaming`, which
 * leaves it in its JS buffer. `sources`: as for [`prove`].
 */
export function preload(circuit_xbc: Bytes, pk_bytes: Bytes, sources?: string | null): void;

/**
 * Parse a circuit + key once for [`prove_streaming_preloaded`]: the variable
 * table, the row source (bytecode templates or `r1cs.stream`) and the key header
 * are kept; the key bytes stay in their JS buffer. `options`:
 *
 * * `r1cs` — as for [`prove_streaming`].
 * * `residentKey` — decode the whole key into wasm memory now, so later proofs
 *   skip point decompression (faster repeat proofs, single-threaded; the decoded
 *   key is ~2.2× the compressed file). Leave off with a worker pool: workers
 *   decompress their own chunks in parallel.
 *
 * Replaces any previously preloaded circuit.
 */
export function preloadStreaming(circuit_xbc: Bytes, pk_bytes: Bytes, options: any): void;

/**
 * Formats a proof and binds its public input to the prepared transaction.
 * The caller verifies the proof against the circuit's trusted verifying key.
 */
export function programProof(proof: Uint8Array, public_inputs: Uint8Array, expected_hash: Uint8Array): ProgramProof;

export function proofInputAddress(bytes: Uint8Array): Record<string, unknown>;

export function proofInputContext(value: ProofInputContext): Record<string, unknown>;

export function proofInputUtxo(value?: WalletUtxo | null): Record<string, unknown>;

/**
 * Generate a Groth16 proof.
 *
 * See the crate docs for the shape of each argument and the return object.
 * Every byte argument accepts a `Uint8Array` **or** an `ArrayBuffer` — so the
 * result of `await response.arrayBuffer()` can be passed directly.
 *
 * Uses the streaming prover: the key is read from `pk_bytes` a chunk of points
 * at a time and the constraint rows are streamed, so memory stays far below the
 * key and circuit sizes (Ed25519 verification fits). The proof is checked
 * against the key's verifying key before it is returned.
 *
 * Throws an `Error` on any error: a malformed `.xbc`, unknown input,
 * an unsatisfiable witness, or a proving key for a different circuit. Pass the
 * build's `sources.json` (text) as `sources` and inputs that fail a check name
 * it: `the inputs fail the check at src/lib.rs:77:20: \`…require_one_of(allowed);\``.
 */
export function prove(circuit_xbc: Bytes, pk_bytes: Bytes, inputs: any, sources?: string | null): ProofBundle;

/**
 * Generate a Groth16 proof with the **streaming** prover.
 *
 * Same arguments and result as [`prove`](crate::prove), plus `options`:
 *
 * * `r1cs` — the `r1cs.stream` written by `xark setup` for a `minimized` key
 *   (`metadata.json` `r1cs_form`). Optional: without it the rows come from the
 *   key, as in `prove` — straight from `circuit.xbc` for a `reduced` key, else
 *   rebuilt from it (once per call; pass `r1cs` to skip that).
 * * `pool` — a worker pool from `js/pool.mjs` (`createPool`) to parallelize the
 *   FFT and MSMs across Web Workers / worker threads (requires
 *   `SharedArrayBuffer`, i.e. a cross-origin-isolated page). Omit for
 *   single-threaded proving.
 * * `msmChunk` — proving-key points per streamed chunk (default 2¹⁸).
 * * `spill` — keep only one quotient vector in wasm memory, parking the other in
 *   a JS buffer (for circuits near the 4 GB wasm32 limit).
 * * `sources` — the build's `sources.json` (text), so inputs that fail a check
 *   name its source line.
 * * `seed` — **testing only**: deterministic prover randomness (breaks
 *   zero-knowledge across proofs). Default: the platform CSPRNG.
 *
 * A key for a different R1CS form is rejected with a clear error, never a bad
 * proof. The proof is self-verified before it is returned. To prove repeatedly,
 * use [`preload_streaming`] + [`prove_streaming_preloaded`].
 */
export function proveStreaming(circuit_xbc: Bytes, pk_bytes: Bytes, inputs: any, options: any): ProofBundle;

/**
 * Prove against the artifacts cached by [`preload_streaming`]. `options` as for
 * [`prove_streaming`] (`pool`, `msmChunk`, `seed`).
 */
export function proveStreamingPreloaded(inputs: any, options: any): ProofBundle;

/**
 * Prove using the artifacts cached by a prior [`preload`] call — skipping the
 * `.xbc` parse, row-source build and `pk.bin` decode on every call.
 *
 * Returns the same shape as [`prove`]. Throws if [`preload`] hasn't been called.
 */
export function prove_preloaded(inputs: any): ProofBundle;

export function repayTransaction(inputs: Repay, sender: Uint8Array, payer: string): ProgramTransaction;

/**
 * Lowercase hex SHA-256 of `bytes`: a verifying key's, as `xark setup` prints it, to
 * pin a verifier to (without WebCrypto, which pages served over plain HTTP lack).
 */
export function sha256Hex(bytes: Bytes): string;

/**
 * A proof (either form) in the on-chain format an exported Solana verifier reads:
 * 256 bytes, `-A || B || C`, little-endian. The same bytes as `xark export`'s
 * `proof.solana.bin` for that proof.
 */
export function solanaProof(proof_bytes: Bytes): Uint8Array;

/**
 * Runs once when the wasm module is instantiated (after `await init()` on the
 * `web` target; on `require`/`import` for node/bundler). Installs the panic
 * hook here so every export gets readable panic messages without each one
 * re-arming it.
 */
export function start(): void;

/**
 * A value of the input type `typeName` (JSON text, in its natural form) as its
 * field elements, decimal, in input order: what `to_fields()` gives in Rust. Hash
 * them with [`poseidon2`] to compute a commitment the way the circuit does.
 */
export function valueFields(schema_json: string, type_name: string, value_json: string): string[];

/**
 * Verify a Groth16 proof against its public inputs, in memory.
 *
 * Each argument is the canonical compressed binary written by `xark setup` /
 * `xark prove` — `proof` and `public_inputs` are exactly what [`prove`]
 * returns, and `vk_bytes` is the contents of `vk.bin`.
 *
 * Returns `true` if the proof is valid for `public_inputs` under `vk_bytes`,
 * `false` if it is well-formed but does not verify. Throws an `Error` on a
 * deserialization error (malformed key / proof / public inputs).
 */
export function verify(vk_bytes: Bytes, proof_bytes: Bytes, public_inputs_bytes: Bytes): boolean;

/**
 * Current wasm linear-memory size in bytes. Linear memory only grows, so after a
 * prove this is the run's peak.
 */
export function wasmMemoryBytes(): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_get_proofbundle_numPublicInputs: (a: number) => number;
    readonly __wbg_get_proofbundle_proof: (a: number) => [number, number];
    readonly __wbg_get_proofbundle_publicInputs: (a: number) => [number, number];
    readonly __wbg_keytranscoder_free: (a: number, b: number) => void;
    readonly __wbg_proofbundle_free: (a: number, b: number) => void;
    readonly __wbg_provingsession_free: (a: number, b: number) => void;
    readonly __wbg_schema_free: (a: number, b: number) => void;
    readonly __wbg_set_proofbundle_numPublicInputs: (a: number, b: number) => void;
    readonly __wbg_set_proofbundle_proof: (a: number, b: number, c: number) => void;
    readonly __wbg_set_proofbundle_publicInputs: (a: number, b: number, c: number) => void;
    readonly __wbg_streamingproof_free: (a: number, b: number) => void;
    readonly __wbg_verifyingkey_free: (a: number, b: number) => void;
    readonly beginKeyTranscode: (a: any) => number;
    readonly beginStreamingProof: (a: any, b: any, c: any) => [number, number, number];
    readonly cancelTransaction: (a: any, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly checkProvingKey: (a: number, b: number, c: number, d: number) => [number, number];
    readonly circuitDigest: (a: any) => [number, number, number, number];
    readonly claimTransaction: (a: any, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly compressedProgramProof: (a: number, b: number) => [number, number, number, number];
    readonly decodePublicValues: (a: number, b: number, c: any) => [number, number, number, number];
    readonly decode_public_inputs: (a: any) => [number, number, number, number];
    readonly encodeInputs: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly encodePublicInputs: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly kernel_cols: (a: number, b: number, c: any, d: number, e: number, f: number, g: number) => void;
    readonly kernel_decompress: (a: number, b: number, c: number) => [number, number, number, number];
    readonly kernel_msm: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly kernel_rows: (a: number, b: number, c: any, d: number, e: number, f: number, g: number) => void;
    readonly keytranscoder_complete: (a: number) => number;
    readonly keytranscoder_push: (a: number, b: number, c: number) => [number, number, number, number];
    readonly loanTermsDataUtxo: (a: any) => [number, number, number];
    readonly offerTermsDataUtxo: (a: any) => [number, number, number];
    readonly offerTransaction: (a: any, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly originateTransaction: (a: any, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly poseidon2: (a: number, b: number) => [number, number, number, number];
    readonly preload: (a: any, b: any, c: number, d: number) => [number, number];
    readonly preloadStreaming: (a: any, b: any, c: any) => [number, number];
    readonly programProof: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly proofInputAddress: (a: number, b: number) => [number, number, number];
    readonly proofInputContext: (a: any) => [number, number, number];
    readonly proofInputUtxo: (a: number) => [number, number, number];
    readonly prove: (a: any, b: any, c: any, d: number, e: number) => [number, number, number];
    readonly proveStreaming: (a: any, b: any, c: any, d: any) => [number, number, number];
    readonly proveStreamingPreloaded: (a: any, b: any) => [number, number, number];
    readonly prove_preloaded: (a: any) => [number, number, number];
    readonly provingsession_new: (a: any, b: any, c: number, d: number) => [number, number, number];
    readonly provingsession_prove: (a: number, b: any, c: any) => [number, number, number];
    readonly repayTransaction: (a: any, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly schema_decodePublicValues: (a: number, b: any) => [number, number, number, number];
    readonly schema_encodeInputs: (a: number, b: number, c: number) => [number, number, number];
    readonly schema_encodePublicInputs: (a: number, b: number, c: number) => [number, number, number, number];
    readonly schema_new: (a: number, b: number) => [number, number, number];
    readonly schema_valueFields: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly sha256Hex: (a: any) => [number, number, number, number];
    readonly solanaProof: (a: any) => [number, number, number, number];
    readonly start: () => void;
    readonly streamingproof_complete: (a: number) => number;
    readonly streamingproof_finish: (a: number) => [number, number, number];
    readonly streamingproof_push: (a: number, b: number, c: number) => [number, number];
    readonly streamingproof_received: (a: number) => number;
    readonly valueFields: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly verify: (a: any, b: any, c: any) => [number, number, number];
    readonly verifyingkey_new: (a: any) => [number, number, number];
    readonly verifyingkey_verify: (a: number, b: any, c: any) => [number, number, number];
    readonly wasmMemoryBytes: () => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
