// © 2026 Adobe. MIT License. See /LICENSE for details.

export function createSharedArrayBuffer(sizeInBytes: number) {
    if (typeof globalThis.SharedArrayBuffer === 'undefined') {
        return new ArrayBuffer(sizeInBytes);
    }
    return new SharedArrayBuffer(sizeInBytes);
}