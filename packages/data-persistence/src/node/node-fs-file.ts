// © 2026 Adobe. MIT License. See /LICENSE for details.

import { promises as fs, constants as fsConstants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { RandomAccessFile } from "../backend/random-access-file.js";

/**
 * Node-fs implementation of RandomAccessFile. The given path must
 * already be validated by the surrounding {@link NodeFsBackend}.
 */
export const createNodeFsFile = async (absPath: string): Promise<RandomAccessFile> => {
    // O_RDWR | O_CREAT: read+write, create-if-missing, never truncate.
    // "a+" is wrong here — append mode ignores the position argument on writes,
    // which breaks writeAt semantics (every write would land at EOF instead).
    const handle: FileHandle = await fs.open(absPath, fsConstants.O_RDWR | fsConstants.O_CREAT, 0o666);
    let closed = false;

    const ensureOpen = (): void => {
        if (closed) throw new Error(`NodeFsFile is closed: ${absPath}`);
    };

    return {
        async readAt(offset, length) {
            ensureOpen();
            const buffer = Buffer.allocUnsafe(length);
            const { bytesRead } = await handle.read(buffer, 0, length, offset);
            // Slice to actual bytes read; copy detached from internal buffer.
            return new Uint8Array(buffer.subarray(0, bytesRead));
        },
        async writeAt(offset, bytes) {
            ensureOpen();
            await handle.write(bytes, 0, bytes.byteLength, offset);
        },
        async appendAt(bytes) {
            ensureOpen();
            const stat = await handle.stat();
            const start = stat.size;
            await handle.write(bytes, 0, bytes.byteLength, start);
            return start + bytes.byteLength;
        },
        async size() {
            ensureOpen();
            const stat = await handle.stat();
            return stat.size;
        },
        async truncate(length) {
            ensureOpen();
            await handle.truncate(length);
        },
        async sync() {
            ensureOpen();
            await handle.sync();
        },
        async close() {
            if (closed) return;
            closed = true;
            await handle.close();
        },
    };
};
