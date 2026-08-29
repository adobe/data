// © 2026 Adobe. MIT License. See /LICENSE for details.
import { DataView32 } from "./data-view-32.js";

/**
 * Build the three 32-bit views over a region of a buffer. `byteOffset` /
 * `byteLength` default to the whole buffer; pass them to view a sub-region (an
 * arena allocator hands out (offset, length) slices of one shared buffer). Both
 * must be multiples of 4 so the element counts divide evenly.
 */
export const createDataView32 = (
    arrayBufferLike: ArrayBufferLike,
    byteOffset = 0,
    byteLength = arrayBufferLike.byteLength - byteOffset,
): DataView32 => {
    const length = byteLength / 4;
    return {
        f32: new Float32Array(arrayBufferLike, byteOffset, length),
        u32: new Uint32Array(arrayBufferLike, byteOffset, length),
        i32: new Int32Array(arrayBufferLike, byteOffset, length),
    };
};
