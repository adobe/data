// © 2026 Adobe. MIT License. See /LICENSE for details.
import { isSharedArrayBuffer } from "./is-shared-array-buffer.js";

/**
 * Returns a Uint8Array backed by ArrayBuffer, copying if the input is backed by SharedArrayBuffer.
 * Blob and other APIs may not accept SharedArrayBuffer-backed views.
 */
export const toArrayBufferBacked = (view: Uint8Array): Uint8Array =>
    (isSharedArrayBuffer(view.buffer) ? view.slice() : view);
