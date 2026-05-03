// © 2026 Adobe. MIT License. See /LICENSE for details.

import { RandomAccessFile } from "./random-access-file.js";

/**
 * In-memory RandomAccessFile backed by a growable Uint8Array. Used by
 * tests and as the in-process backend implementation. Behaves
 * identically across Node and browser runtimes.
 */
export const createMemoryFile = (initial?: Uint8Array): RandomAccessFile => {
    let buffer: Uint8Array = initial ? new Uint8Array(initial) : new Uint8Array(0);
    let length: number = buffer.byteLength;
    let closed = false;

    const ensureOpen = (): void => {
        if (closed) throw new Error("MemoryFile is closed");
    };

    const ensureCapacity = (required: number): void => {
        if (required <= buffer.byteLength) return;
        // Grow by powers of two so amortized cost stays O(1).
        let newCapacity = Math.max(buffer.byteLength * 2, 64);
        while (newCapacity < required) newCapacity *= 2;
        const grown = new Uint8Array(newCapacity);
        grown.set(buffer.subarray(0, length));
        buffer = grown;
    };

    return {
        async readAt(offset: number, requestedLength: number): Promise<Uint8Array> {
            ensureOpen();
            if (offset < 0 || requestedLength < 0) {
                throw new RangeError(`readAt: offset and length must be non-negative (offset=${offset}, length=${requestedLength})`);
            }
            const end = Math.min(offset + requestedLength, length);
            const actualLength = Math.max(0, end - offset);
            if (actualLength === 0) return new Uint8Array(0);
            // Copy out so the caller cannot mutate our internal buffer.
            return new Uint8Array(buffer.buffer, buffer.byteOffset + offset, actualLength).slice();
        },
        async writeAt(offset: number, bytes: Uint8Array): Promise<void> {
            ensureOpen();
            if (offset < 0) {
                throw new RangeError(`writeAt: offset must be non-negative (offset=${offset})`);
            }
            const end = offset + bytes.byteLength;
            ensureCapacity(end);
            buffer.set(bytes, offset);
            if (end > length) length = end;
        },
        async appendAt(bytes: Uint8Array): Promise<number> {
            ensureOpen();
            const start = length;
            const end = start + bytes.byteLength;
            ensureCapacity(end);
            buffer.set(bytes, start);
            length = end;
            return length;
        },
        async size(): Promise<number> {
            ensureOpen();
            return length;
        },
        async truncate(newLength: number): Promise<void> {
            ensureOpen();
            if (newLength < 0) {
                throw new RangeError(`truncate: length must be non-negative (length=${newLength})`);
            }
            if (newLength > length) {
                ensureCapacity(newLength);
                // Zero-fill the grown region.
                buffer.fill(0, length, newLength);
            } else {
                // Zero-fill the freed region so subsequent grows do not
                // expose stale bytes.
                buffer.fill(0, newLength, length);
            }
            length = newLength;
        },
        async sync(): Promise<void> {
            ensureOpen();
        },
        async close(): Promise<void> {
            closed = true;
            buffer = new Uint8Array(0);
            length = 0;
        },
    };
};
