// © 2026 Adobe. MIT License. See /LICENSE for details.
export function isSharedArrayBuffer(arrayBuffer: ArrayBufferLike): arrayBuffer is SharedArrayBuffer {
    return "grow" in arrayBuffer;
}
