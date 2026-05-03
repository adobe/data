// © 2026 Adobe. MIT License. See /LICENSE for details.

import { RandomAccessFile } from "../backend/random-access-file.js";

/**
 * Minimal local declaration of the OPFS sync-handle interface. The
 * standard `lib.dom.d.ts` for this TS / TS-lib version may not yet
 * include `FileSystemSyncAccessHandle`, so we re-declare just enough
 * for our adapter. When the runtime types catch up this declaration
 * remains compatible.
 */
interface OpfsSyncAccessHandle {
    read(buffer: ArrayBufferView, options?: { at?: number }): number;
    write(buffer: ArrayBufferView, options?: { at?: number }): number;
    truncate(newSize: number): void;
    getSize(): number;
    flush(): void;
    close(): void;
}

interface OpfsFileHandleWithSync {
    createSyncAccessHandle(): Promise<OpfsSyncAccessHandle>;
}

/**
 * OPFS sync-handle adapter. Only callable inside a dedicated worker
 * because `FileSystemSyncAccessHandle` is unavailable on the main
 * thread per the spec.
 *
 * The async surface in `RandomAccessFile` is satisfied by sync calls
 * under the hood.
 */
export const createOpfsSyncFile = async (
    handle: FileSystemFileHandle,
): Promise<RandomAccessFile> => {
    const handleAsSync = handle as unknown as Partial<OpfsFileHandleWithSync>;
    if (typeof handleAsSync.createSyncAccessHandle !== "function") {
        throw new Error(
            "OpfsSyncFile requires FileSystemFileHandle.createSyncAccessHandle (only available in dedicated workers)",
        );
    }
    const sync: OpfsSyncAccessHandle = await handleAsSync.createSyncAccessHandle();
    let closed = false;

    const ensureOpen = (): void => {
        if (closed) throw new Error("OpfsSyncFile is closed");
    };

    return {
        async readAt(offset, length) {
            ensureOpen();
            const buffer = new Uint8Array(length);
            const bytesRead = sync.read(buffer, { at: offset });
            return buffer.subarray(0, bytesRead).slice();
        },
        async writeAt(offset, bytes) {
            ensureOpen();
            sync.write(bytes, { at: offset });
        },
        async appendAt(bytes) {
            ensureOpen();
            const start = sync.getSize();
            sync.write(bytes, { at: start });
            return start + bytes.byteLength;
        },
        async size() {
            ensureOpen();
            return sync.getSize();
        },
        async truncate(length) {
            ensureOpen();
            sync.truncate(length);
        },
        async sync() {
            ensureOpen();
            sync.flush();
        },
        async close() {
            if (closed) return;
            closed = true;
            sync.close();
        },
    };
};
