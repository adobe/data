// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Copy `byteLength` bytes from `src`[@`srcByteOffset`] to
 * `dst`[@`dstByteOffset`].
 *
 * Uses `copyWithin` when the source and destination are the **same**
 * `ArrayBuffer` (or SharedArrayBuffer) and the ranges overlap; otherwise it
 * falls back to `TypedArray.set`.
 */
export function blit(
    src: ArrayBufferLike,
    dst: ArrayBufferLike,
    srcByteOffset = 0,
    dstByteOffset = 0,
    byteLength = src.byteLength - srcByteOffset,
) {
    // Fast path: in-place copy on the same buffer
    if (src === dst) {
        /* Uint8Array#copyWithin handles overlap correctly and
           stays entirely in native code. */
        new Uint8Array(dst).copyWithin(
            dstByteOffset,
            srcByteOffset,
            srcByteOffset + byteLength,
        );
    } else {
        // Different buffers → fall back to a zero-copy .set
        new Uint8Array(dst, dstByteOffset, byteLength).set(
            new Uint8Array(src, srcByteOffset, byteLength),
        );
    }
}
