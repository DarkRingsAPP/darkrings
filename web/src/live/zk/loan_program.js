/* @ts-self-types="./loan_program.d.ts" */

/**
 * Re-encodes a proving key with uncompressed points as it streams through:
 * `push(chunk)` returns the output produced so far. Store the result (OPFS,
 * IndexedDB, Cache API) and prove from it next time — every point read then
 * skips its square root, the dominant cost of a WASM proof. See
 * `js/stream.mjs` `transcodeKey`.
 */
export class KeyTranscoder {
    static __wrap(ptr) {
        const obj = Object.create(KeyTranscoder.prototype);
        obj.__wbg_ptr = ptr;
        KeyTranscoderFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        KeyTranscoderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_keytranscoder_free(ptr, 0);
    }
    /**
     * Whether the whole key has been read.
     * @returns {boolean}
     */
    get complete() {
        const ret = wasm.keytranscoder_complete(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Feed the next bytes of `pk.bin`; returns the uncompressed bytes produced.
     * @param {Uint8Array} chunk
     * @returns {Uint8Array}
     */
    push(chunk) {
        const ptr0 = passArray8ToWasm0(chunk, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.keytranscoder_push(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
}
if (Symbol.dispose) KeyTranscoder.prototype[Symbol.dispose] = KeyTranscoder.prototype.free;

/**
 * The result of [`prove`] / [`prove_preloaded`]: the canonical compressed
 * proof + public-input bytes (identical to the host's `proof.bin` /
 * `public_inputs.bin`), plus the public-input count.
 */
export class ProofBundle {
    static __wrap(ptr) {
        const obj = Object.create(ProofBundle.prototype);
        obj.__wbg_ptr = ptr;
        ProofBundleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ProofBundleFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_proofbundle_free(ptr, 0);
    }
    /**
     * Number of public inputs.
     * @returns {number}
     */
    get numPublicInputs() {
        const ret = wasm.__wbg_get_proofbundle_numPublicInputs(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Canonical compressed proof bytes (`== proof.bin`).
     * @returns {Uint8Array}
     */
    get proof() {
        const ret = wasm.__wbg_get_proofbundle_proof(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Canonical compressed public-input bytes (`== public_inputs.bin`).
     * @returns {Uint8Array}
     */
    get publicInputs() {
        const ret = wasm.__wbg_get_proofbundle_publicInputs(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Number of public inputs.
     * @param {number} arg0
     */
    set numPublicInputs(arg0) {
        wasm.__wbg_set_proofbundle_numPublicInputs(this.__wbg_ptr, arg0);
    }
    /**
     * Canonical compressed proof bytes (`== proof.bin`).
     * @param {Uint8Array} arg0
     */
    set proof(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_proofbundle_proof(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Canonical compressed public-input bytes (`== public_inputs.bin`).
     * @param {Uint8Array} arg0
     */
    set publicInputs(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_proofbundle_publicInputs(this.__wbg_ptr, ptr0, len0);
    }
}
if (Symbol.dispose) ProofBundle.prototype[Symbol.dispose] = ProofBundle.prototype.free;

/**
 * A circuit's `circuit.xbc` and `pk.bin`, parsed and decoded once, for many proofs:
 * what [`preload`] caches, as an object of its own, so each prover keeps its own.
 * The key is decoded into wasm memory (about 2.2× `pk.bin`), so a proof skips the
 * `.xbc` parse, row-source build and point decompression [`prove`] does each time.
 * `sources`: as for [`prove`].
 */
export class ProvingSession {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ProvingSessionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_provingsession_free(ptr, 0);
    }
    /**
     * @param {Bytes} circuit_xbc
     * @param {Bytes} pk_bytes
     * @param {string | null} [sources]
     */
    constructor(circuit_xbc, pk_bytes, sources) {
        var ptr0 = isLikeNone(sources) ? 0 : passStringToWasm0(sources, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.provingsession_new(circuit_xbc, pk_bytes, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        ProvingSessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Prove: the same arguments (bar the artifacts) and result as [`prove`].
     * `options` (optional): `pool`, a worker pool from `js/pool.mjs`, as for
     * `proveStreaming`.
     * @param {any} inputs
     * @param {any} options
     * @returns {ProofBundle}
     */
    prove(inputs, options) {
        const ret = wasm.provingsession_prove(this.__wbg_ptr, inputs, options);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ProofBundle.__wrap(ret[0]);
    }
}
if (Symbol.dispose) ProvingSession.prototype[Symbol.dispose] = ProvingSession.prototype.free;

/**
 * A circuit's `schema.json`, parsed once: what a generated client holds to encode
 * and decode values, instead of passing the text to every call.
 */
export class Schema {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SchemaFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_schema_free(ptr, 0);
    }
    /**
     * As [`decode_public_values`].
     * @param {Bytes} public_inputs_bytes
     * @returns {string}
     */
    decodePublicValues(public_inputs_bytes) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.schema_decodePublicValues(this.__wbg_ptr, public_inputs_bytes);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * As [`encode_inputs`].
     * @param {string} inputs_json
     * @returns {any}
     */
    encodeInputs(inputs_json) {
        const ptr0 = passStringToWasm0(inputs_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schema_encodeInputs(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * As [`encode_public_inputs`].
     * @param {string} public_json
     * @returns {Uint8Array}
     */
    encodePublicInputs(public_json) {
        const ptr0 = passStringToWasm0(public_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schema_encodePublicInputs(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Parse `schema.json` (text). Throws if it isn't a schema this xark reads.
     * @param {string} schema_json
     */
    constructor(schema_json) {
        const ptr0 = passStringToWasm0(schema_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schema_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        SchemaFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * As [`value_fields`].
     * @param {string} type_name
     * @param {string} value_json
     * @returns {string[]}
     */
    valueFields(type_name, value_json) {
        const ptr0 = passStringToWasm0(type_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(value_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.schema_valueFields(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayJsValueFromWasm0(ret[0], ret[1]);
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v3;
    }
}
if (Symbol.dispose) Schema.prototype[Symbol.dispose] = Schema.prototype.free;

/**
 * A proof waiting for proving-key bytes: created by [`begin_streaming_proof`],
 * fed with [`push`](Self::push) (e.g. each chunk of a `fetch` body), completed
 * with [`finish`](Self::finish). The key is never held — each chunk of points is
 * folded into its MSM and dropped — and the witness and quotient are computed
 * before the first byte is needed, so proving overlaps the download.
 */
export class StreamingProof {
    static __wrap(ptr) {
        const obj = Object.create(StreamingProof.prototype);
        obj.__wbg_ptr = ptr;
        StreamingProofFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        StreamingProofFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_streamingproof_free(ptr, 0);
    }
    /**
     * Whether the whole key has arrived.
     * @returns {boolean}
     */
    get complete() {
        const ret = wasm.streamingproof_complete(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Assemble and self-verify the proof (after the whole key has been pushed).
     * @returns {ProofBundle}
     */
    finish() {
        const ret = wasm.streamingproof_finish(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ProofBundle.__wrap(ret[0]);
    }
    /**
     * Feed the next bytes of `pk.bin` (any chunk size, in order).
     * @param {Uint8Array} chunk
     */
    push(chunk) {
        const ptr0 = passArray8ToWasm0(chunk, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.streamingproof_push(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Proving-key bytes consumed so far.
     * @returns {number}
     */
    get received() {
        const ret = wasm.streamingproof_received(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) StreamingProof.prototype[Symbol.dispose] = StreamingProof.prototype.free;

/**
 * A verifying key (`vk.bin`), decoded once: a malformed key throws here, so that
 * [`VerifyingKey::verify`](JsVerifyingKey::verify) throws only on a malformed proof
 * or public inputs.
 */
export class VerifyingKey {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        VerifyingKeyFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_verifyingkey_free(ptr, 0);
    }
    /**
     * @param {Bytes} vk_bytes
     */
    constructor(vk_bytes) {
        const ret = wasm.verifyingkey_new(vk_bytes);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        VerifyingKeyFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * As [`verify`], with this key.
     * @param {Bytes} proof_bytes
     * @param {Bytes} public_inputs_bytes
     * @returns {boolean}
     */
    verify(proof_bytes, public_inputs_bytes) {
        const ret = wasm.verifyingkey_verify(this.__wbg_ptr, proof_bytes, public_inputs_bytes);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
}
if (Symbol.dispose) VerifyingKey.prototype[Symbol.dispose] = VerifyingKey.prototype.free;

/**
 * Start transcoding. `options.pool` decompresses on the worker pool.
 * @param {any} options
 * @returns {KeyTranscoder}
 */
export function beginKeyTranscode(options) {
    const ret = wasm.beginKeyTranscode(options);
    return KeyTranscoder.__wrap(ret);
}

/**
 * Start a push-driven proof. `options` as for [`prove_streaming`] (`r1cs`,
 * `pool`, `msmChunk`, `seed`), except that `r1cs` is required for a `minimized`
 * key: the rows are needed before the key arrives.
 * @param {Bytes} circuit_xbc
 * @param {any} inputs
 * @param {any} options
 * @returns {StreamingProof}
 */
export function beginStreamingProof(circuit_xbc, inputs, options) {
    const ret = wasm.beginStreamingProof(circuit_xbc, inputs, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return StreamingProof.__wrap(ret[0]);
}

/**
 * @param {Cancel} inputs
 * @param {Uint8Array} sender
 * @param {string} payer
 * @returns {ProgramTransaction}
 */
export function cancelTransaction(inputs, sender, payer) {
    const ptr0 = passArray8ToWasm0(sender, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(payer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.cancelTransaction(inputs, ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Validate exact proving-key bytes against a SHA-256 pin from trusted build metadata.
 * @param {Uint8Array} proving_key
 * @param {Uint8Array | null} [expected_sha256]
 */
export function checkProvingKey(proving_key, expected_sha256) {
    const ptr0 = passArray8ToWasm0(proving_key, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(expected_sha256) ? 0 : passArray8ToWasm0(expected_sha256, wasm.__wbindgen_malloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.checkProvingKey(ptr0, len0, ptr1, len1);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * The circuit digest of a `circuit.xbc` (what `xark build` prints, and a key's
 * `metadata.json` records): the same for every build of the circuit, whichever Rust
 * compiled it, and different for any other circuit.
 * @param {Bytes} circuit_xbc
 * @returns {string}
 */
export function circuitDigest(circuit_xbc) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.circuitDigest(circuit_xbc);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {Claim} inputs
 * @param {Uint8Array} sender
 * @param {string} payer
 * @returns {ProgramTransaction}
 */
export function claimTransaction(inputs, sender, payer) {
    const ptr0 = passArray8ToWasm0(sender, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(payer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.claimTransaction(inputs, ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {Uint8Array} proof
 * @returns {Uint8Array}
 */
export function compressedProgramProof(proof) {
    const ptr0 = passArray8ToWasm0(proof, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compressedProgramProof(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Canonical public-input bytes decoded to their natural forms: JSON text of an
 * object keyed `camelCase` (a time as an ISO 8601 date or date-time, flags as their names, bytes
 * as `0x`-hex, field elements as decimal strings).
 * @param {string} schema_json
 * @param {Bytes} public_inputs_bytes
 * @returns {string}
 */
export function decodePublicValues(schema_json, public_inputs_bytes) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(schema_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.decodePublicValues(ptr0, len0, public_inputs_bytes);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Decode binary public inputs (the `publicInputs` `Uint8Array` from [`prove`],
 * == `public_inputs.bin`) to decimal strings, in proof order.
 * @param {Bytes} public_inputs_bytes
 * @returns {string[]}
 */
export function decode_public_inputs(public_inputs_bytes) {
    const ret = wasm.decode_public_inputs(public_inputs_bytes);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]);
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
}

/**
 * The circuit's inputs (JSON text: an object of every input, each in its natural
 * form, `camelCase` or `snake_case` keys) as the `leaf → decimal` object [`prove`]
 * takes, encoded and checked against `schema` (the circuit's `schema.json` text).
 * A generated client holds a [`Schema`](JsSchema) instead.
 * @param {string} schema_json
 * @param {string} inputs_json
 * @returns {any}
 */
export function encodeInputs(schema_json, inputs_json) {
    const ptr0 = passStringToWasm0(schema_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(inputs_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.encodeInputs(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * The public inputs (JSON text, as for [`encode_inputs`]; only the public ones
 * needed) as the canonical bytes [`verify`] takes (`public_inputs.bin`).
 * @param {string} schema_json
 * @param {string} public_json
 * @returns {Uint8Array}
 */
export function encodePublicInputs(schema_json, public_json) {
    const ptr0 = passStringToWasm0(schema_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(public_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.encodePublicInputs(ptr0, len0, ptr1, len1);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * Worker kernel: a row-major `N1 × b` column tile at column `c0`.
 * `op`: 0 = inverse + twiddle·(1/N), 1 = twiddle + forward.
 * @param {Uint8Array} block
 * @param {number} n1
 * @param {number} n2
 * @param {number} c0
 * @param {number} op
 */
export function kernel_cols(block, n1, n2, c0, op) {
    var ptr0 = passArray8ToWasm0(block, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.kernel_cols(ptr0, len0, block, n1, n2, c0, op);
}

/**
 * Worker kernel: re-encode compressed points uncompressed.
 * @param {boolean} g2
 * @param {Uint8Array} points
 * @returns {Uint8Array}
 */
export function kernel_decompress(g2, points) {
    const ptr0 = passArray8ToWasm0(points, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.kernel_decompress(g2, ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Worker kernel: MSM over serialized points and 32-byte LE scalars; returns the
 * uncompressed affine sum.
 * @param {boolean} g2
 * @param {Uint8Array} points
 * @param {boolean} compressed
 * @param {Uint8Array} scalars
 * @returns {Uint8Array}
 */
export function kernel_msm(g2, points, compressed, scalars) {
    const ptr0 = passArray8ToWasm0(points, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(scalars, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.kernel_msm(g2, ptr0, len0, compressed, ptr1, len1);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * Worker kernel: whole rows `[first_row, …)` of a coset transform chain.
 * @param {Uint8Array} rows
 * @param {number} n1
 * @param {number} n2
 * @param {number} first_row
 * @param {boolean} to_coset
 */
export function kernel_rows(rows, n1, n2, first_row, to_coset) {
    var ptr0 = passArray8ToWasm0(rows, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.kernel_rows(ptr0, len0, rows, n1, n2, first_row, to_coset);
}

/**
 * @param {WalletUtxo} utxo
 * @returns {DataUtxo<LoanTerms>}
 */
export function loanTermsDataUtxo(utxo) {
    const ret = wasm.loanTermsDataUtxo(utxo);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {WalletUtxo} utxo
 * @returns {DataUtxo<OfferTerms>}
 */
export function offerTermsDataUtxo(utxo) {
    const ret = wasm.offerTermsDataUtxo(utxo);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {Offer} inputs
 * @param {Uint8Array} sender
 * @param {string} payer
 * @returns {ProgramTransaction}
 */
export function offerTransaction(inputs, sender, payer) {
    const ptr0 = passArray8ToWasm0(sender, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(payer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.offerTransaction(inputs, ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {Originate} inputs
 * @param {Uint8Array} sender
 * @param {string} payer
 * @returns {ProgramTransaction}
 */
export function originateTransaction(inputs, sender, payer) {
    const ptr0 = passArray8ToWasm0(sender, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(payer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.originateTransaction(inputs, ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * `xark_poseidon2::hash` of field elements (decimal or `0x`-hex strings, each
 * below the field order), as a decimal string: the value the gadget constrains.
 * @param {string[]} inputs
 * @returns {string}
 */
export function poseidon2(inputs) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passArrayJsValueToWasm0(inputs, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.poseidon2(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

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
 * @param {Bytes} circuit_xbc
 * @param {Bytes} pk_bytes
 * @param {string | null} [sources]
 */
export function preload(circuit_xbc, pk_bytes, sources) {
    var ptr0 = isLikeNone(sources) ? 0 : passStringToWasm0(sources, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    const ret = wasm.preload(circuit_xbc, pk_bytes, ptr0, len0);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

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
 * @param {Bytes} circuit_xbc
 * @param {Bytes} pk_bytes
 * @param {any} options
 */
export function preloadStreaming(circuit_xbc, pk_bytes, options) {
    const ret = wasm.preloadStreaming(circuit_xbc, pk_bytes, options);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Formats a proof and binds its public input to the prepared transaction.
 * The caller verifies the proof against the circuit's trusted verifying key.
 * @param {Uint8Array} proof
 * @param {Uint8Array} public_inputs
 * @param {Uint8Array} expected_hash
 * @returns {ProgramProof}
 */
export function programProof(proof, public_inputs, expected_hash) {
    const ptr0 = passArray8ToWasm0(proof, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(public_inputs, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(expected_hash, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.programProof(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {Uint8Array} bytes
 * @returns {Record<string, unknown>}
 */
export function proofInputAddress(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.proofInputAddress(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {ProofInputContext} value
 * @returns {Record<string, unknown>}
 */
export function proofInputContext(value) {
    const ret = wasm.proofInputContext(value);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {WalletUtxo | null} [value]
 * @returns {Record<string, unknown>}
 */
export function proofInputUtxo(value) {
    const ret = wasm.proofInputUtxo(isLikeNone(value) ? 0 : addToExternrefTable0(value));
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

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
 * @param {Bytes} circuit_xbc
 * @param {Bytes} pk_bytes
 * @param {any} inputs
 * @param {string | null} [sources]
 * @returns {ProofBundle}
 */
export function prove(circuit_xbc, pk_bytes, inputs, sources) {
    var ptr0 = isLikeNone(sources) ? 0 : passStringToWasm0(sources, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    const ret = wasm.prove(circuit_xbc, pk_bytes, inputs, ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ProofBundle.__wrap(ret[0]);
}

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
 * @param {Bytes} circuit_xbc
 * @param {Bytes} pk_bytes
 * @param {any} inputs
 * @param {any} options
 * @returns {ProofBundle}
 */
export function proveStreaming(circuit_xbc, pk_bytes, inputs, options) {
    const ret = wasm.proveStreaming(circuit_xbc, pk_bytes, inputs, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ProofBundle.__wrap(ret[0]);
}

/**
 * Prove against the artifacts cached by [`preload_streaming`]. `options` as for
 * [`prove_streaming`] (`pool`, `msmChunk`, `seed`).
 * @param {any} inputs
 * @param {any} options
 * @returns {ProofBundle}
 */
export function proveStreamingPreloaded(inputs, options) {
    const ret = wasm.proveStreamingPreloaded(inputs, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ProofBundle.__wrap(ret[0]);
}

/**
 * Prove using the artifacts cached by a prior [`preload`] call — skipping the
 * `.xbc` parse, row-source build and `pk.bin` decode on every call.
 *
 * Returns the same shape as [`prove`]. Throws if [`preload`] hasn't been called.
 * @param {any} inputs
 * @returns {ProofBundle}
 */
export function prove_preloaded(inputs) {
    const ret = wasm.prove_preloaded(inputs);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ProofBundle.__wrap(ret[0]);
}

/**
 * @param {Repay} inputs
 * @param {Uint8Array} sender
 * @param {string} payer
 * @returns {ProgramTransaction}
 */
export function repayTransaction(inputs, sender, payer) {
    const ptr0 = passArray8ToWasm0(sender, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(payer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.repayTransaction(inputs, ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Lowercase hex SHA-256 of `bytes`: a verifying key's, as `xark setup` prints it, to
 * pin a verifier to (without WebCrypto, which pages served over plain HTTP lack).
 * @param {Bytes} bytes
 * @returns {string}
 */
export function sha256Hex(bytes) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.sha256Hex(bytes);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * A proof (either form) in the on-chain format an exported Solana verifier reads:
 * 256 bytes, `-A || B || C`, little-endian. The same bytes as `xark export`'s
 * `proof.solana.bin` for that proof.
 * @param {Bytes} proof_bytes
 * @returns {Uint8Array}
 */
export function solanaProof(proof_bytes) {
    const ret = wasm.solanaProof(proof_bytes);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * Runs once when the wasm module is instantiated (after `await init()` on the
 * `web` target; on `require`/`import` for node/bundler). Installs the panic
 * hook here so every export gets readable panic messages without each one
 * re-arming it.
 */
export function start() {
    wasm.start();
}

/**
 * A value of the input type `typeName` (JSON text, in its natural form) as its
 * field elements, decimal, in input order: what `to_fields()` gives in Rust. Hash
 * them with [`poseidon2`] to compute a commitment the way the circuit does.
 * @param {string} schema_json
 * @param {string} type_name
 * @param {string} value_json
 * @returns {string[]}
 */
export function valueFields(schema_json, type_name, value_json) {
    const ptr0 = passStringToWasm0(schema_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(type_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(value_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.valueFields(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v4 = getArrayJsValueFromWasm0(ret[0], ret[1]);
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v4;
}

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
 * @param {Bytes} vk_bytes
 * @param {Bytes} proof_bytes
 * @param {Bytes} public_inputs_bytes
 * @returns {boolean}
 */
export function verify(vk_bytes, proof_bytes, public_inputs_bytes) {
    const ret = wasm.verify(vk_bytes, proof_bytes, public_inputs_bytes);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] !== 0;
}

/**
 * Current wasm linear-memory size in bytes. Linear memory only grows, so after a
 * prove this is the run's peak.
 * @returns {number}
 */
export function wasmMemoryBytes() {
    const ret = wasm.wasmMemoryBytes();
    return ret;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_30c8987f7c2ed4e2: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_Number_14af1003b8dd5ead: function(arg0) {
            const ret = Number(arg0);
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_bigint_get_as_i64_a2383202b9353e4c: function(arg0, arg1) {
            const v = arg1;
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_5b446f51afd21013: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_copy_to_typed_array_88899a52af046901: function(arg0, arg1, arg2) {
            new Uint8Array(arg2.buffer, arg2.byteOffset, arg2.byteLength).set(getArrayU8FromWasm0(arg0, arg1));
        },
        __wbg___wbindgen_debug_string_4687d8d8c2017d52: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_92f62ee1427d9e49: function(arg0, arg1) {
            const ret = arg0 in arg1;
            return ret;
        },
        __wbg___wbindgen_is_bigint_b123553bed3bb382: function(arg0) {
            const ret = typeof(arg0) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_falsy_16bd49b68658263e: function(arg0) {
            const ret = !arg0;
            return ret;
        },
        __wbg___wbindgen_is_function_1f9d30630b8b1d3d: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_e343b7d08827ba72: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_is_object_3c45d4f2dde4e749: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_90b56bc79aad6f6c: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_8865fb403f8fe9d8: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_02babf21faa37971: function(arg0, arg1) {
            const ret = arg0 === arg1;
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_677f21e468d6b461: function(arg0, arg1) {
            const ret = arg0 == arg1;
            return ret;
        },
        __wbg___wbindgen_memory_caa4a6165639c8b5: function() {
            const ret = wasm.memory;
            return ret;
        },
        __wbg___wbindgen_number_get_2e0e7dee9f701a71: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_0380ccaa2f57f0d9: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_buffer_7afc7cca4d0cf036: function(arg0) {
            const ret = arg0.buffer;
            return ret;
        },
        __wbg_byteLength_27689b065d089962: function(arg0) {
            const ret = arg0.byteLength;
            return ret;
        },
        __wbg_call_187d372bd5fdd4aa: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_call_6137034ef55c9d0f: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_decompress_7182bb6df2b97199: function(arg0, arg1, arg2, arg3, arg4) {
            const ret = arg1.decompress(arg2 !== 0, getArrayU8FromWasm0(arg3, arg4));
            var ptr1 = isLikeNone(ret) ? 0 : passArray8ToWasm0(ret, wasm.__wbindgen_malloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_done_b41a1d26cdb37fb6: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_entries_fb6397112b1de25f: function(arg0) {
            const ret = Object.entries(arg0);
            return ret;
        },
        __wbg_error_757e9472f8410341: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_fromCosetToT_6fac1476808fcea1: function(arg0, arg1, arg2, arg3, arg4) {
            const ret = arg0.fromCosetToT(arg1 >>> 0, arg2 >>> 0, getArrayU8FromWasm0(arg3, arg4));
            return ret;
        },
        __wbg_from_296ca31f8d0f1c52: function(arg0) {
            const ret = Array.from(arg0);
            return ret;
        },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_get_31af05bd4842a84f: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_658f6698067d9515: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_6c896e0571ddae51: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_unchecked_288889d017702237: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_with_ref_key_6412cf3094599694: function(arg0, arg1) {
            const ret = arg0[arg1];
            return ret;
        },
        __wbg_instanceof_ArrayBuffer_a99f175873e5d9b8: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Map_b2611749102d7ba3: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Map;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_SharedArrayBuffer_6370d767dfea8938: function(arg0) {
            let result;
            try {
                result = arg0 instanceof SharedArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_828cef2aaacafc31: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_e15a2ff68ffdbef2: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_isSafeInteger_717808ad6a54bd9e: function(arg0) {
            const ret = Number.isSafeInteger(arg0);
            return ret;
        },
        __wbg_iterator_e3c31c892080e444: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_length_7f3c00c40364105e: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_d4bdea10311bd9cf: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_msm_aac6f4fb01d86520: function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
            const ret = arg1.msm(arg2 !== 0, getArrayU8FromWasm0(arg3, arg4), arg5 !== 0, getArrayU8FromWasm0(arg6, arg7));
            var ptr1 = isLikeNone(ret) ? 0 : passArray8ToWasm0(ret, wasm.__wbindgen_malloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_new_1dbf7428bba60a42: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_28744009d011f847: function() {
            const ret = new Map();
            return ret;
        },
        __wbg_new_343a093a3c2ffb4e: function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_617a8cdb8bb1130e: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_ee2291f50781bf1d: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_with_length_3da0ad195f6f63ba: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_next_33784799010f1bbe: function(arg0) {
            const ret = arg0.next;
            return ret;
        },
        __wbg_next_f4aac29c42af995c: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_bc27214492979395: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_push_2baf45db356cf468: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_set_145a351398b48c65: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_575d3ddb70fe831d: function(arg0, arg1, arg2) {
            arg0.set(getArrayU8FromWasm0(arg1, arg2));
        },
        __wbg_set_6ae97e73113c4f0b: function(arg0, arg1, arg2) {
            const ret = arg0.set(arg1, arg2);
            return ret;
        },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_bea140a88be9b277: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_set_name_2c630595dc90a7aa: function(arg0, arg1, arg2) {
            arg0.name = getStringFromWasm0(arg1, arg2);
        },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_static_accessor_GLOBAL_266715b9d96ba635: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_10fb7dc1ae063179: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_0b583911f537483a: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_d7f903d1508cbdc4: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_002b94d5e13d1411: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_toCoset_4134bb2cc12f47d9: function(arg0, arg1, arg2, arg3, arg4) {
            const ret = arg0.toCoset(arg1 >>> 0, arg2 >>> 0, getArrayU8FromWasm0(arg3, arg4));
            return ret;
        },
        __wbg_toString_3e46331018353800: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.toString(arg1);
            return ret;
        }, arguments); },
        __wbg_value_f3c585ee8f5ba40c: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbindgen_generic_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000005: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./loan_program_bg.js": import0,
    };
}

const KeyTranscoderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_keytranscoder_free(ptr, 1));
const ProofBundleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_proofbundle_free(ptr, 1));
const ProvingSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_provingsession_free(ptr, 1));
const SchemaFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_schema_free(ptr, 1));
const StreamingProofFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_streamingproof_free(ptr, 1));
const VerifyingKeyFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_verifyingkey_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    for (let i = 0; i < array.length; i++) {
        const add = addToExternrefTable0(array[i]);
        getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('loan_program_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
