// © 2026 Adobe. MIT License. See /LICENSE for details.
export function isArrayBuffer(arrayBuffer: ArrayBufferLike): boolean {
    return "resize" in arrayBuffer;
}
