// © 2026 Adobe. MIT License. See /LICENSE for details.
import { isSharedArrayBuffer } from "./is-shared-array-buffer.js";

/**
 * Returns a Uint8Array backed by ArrayBuffer, copying if the input is backed by SharedArrayBuffer.
 * Blob and other APIs may not accept SharedArrayBuffer-backed views.
 */
export function toArrayBufferBacked(view: Uint8Array): Uint8Array<ArrayBuffer> {
    if (isSharedArrayBuffer(view.buffer)) {
        return view.slice();
    }
    // view.buffer is ArrayBuffer here; TypeScript cannot narrow view from buffer check
    return view as Uint8Array<ArrayBuffer>;
}
