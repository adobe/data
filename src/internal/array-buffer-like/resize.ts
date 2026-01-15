// © 2026 Adobe. MIT License. See /LICENSE for details.
import { copy } from "./copy.js";

/**
 * Resizes an ArrayBuffer to a new capacity, preserving data up to the minimum of old and new sizes.
 * Can be used for both growing and shrinking.
 */
export function resize<T extends ArrayBufferLike>(arrayBuffer: T, newCapacity: number): T {
    const constructor = arrayBuffer.constructor as new (size: number) => T;
    const newArrayBuffer = new constructor(newCapacity);
    // Copy only the amount that fits in the new buffer
    const copyLength = Math.min(arrayBuffer.byteLength, newCapacity);
    copy(arrayBuffer, newArrayBuffer, copyLength);
    return newArrayBuffer;
}
