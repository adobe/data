// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { PersistenceBackend } from "../backend/persistence-backend.js";
import type { RandomAccessFile } from "../backend/random-access-file.js";
import { validateRelPath } from "../backend/validate-rel-path.js";
import { createOpfsSyncFile } from "./opfs-sync-file.js";

const splitPath = (relPath: string): string[] =>
    relPath.split("/").filter(seg => seg !== "" && seg !== ".");

/**
 * Returns true when `err` is a "this OPFS entry doesn't exist" error.
 * Cross-runtime safe: in workers without DOMException at the global
 * (vanishingly rare but possible in older browsers), `instanceof`
 * falls back to a duck-typed `name === "NotFoundError"` check rather
 * than throwing.
 */
const isNotFoundError = (err: unknown): boolean => {
    if (typeof DOMException !== "undefined" && err instanceof DOMException) {
        return err.name === "NotFoundError";
    }
    return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "NotFoundError";
};

/**
 * Walk an OPFS directory tree, optionally creating intermediate
 * directories. Returns the resolved directory handle.
 */
const resolveDir = async (
    root: FileSystemDirectoryHandle,
    segments: readonly string[],
    create: boolean,
): Promise<FileSystemDirectoryHandle> => {
    let dir = root;
    for (const seg of segments) {
        dir = await dir.getDirectoryHandle(seg, { create });
    }
    return dir;
};

const LOCK_FILENAME = "lock.json";

/**
 * Acquire the OPFS single-writer lock by opening a sync access handle
 * on `lock.json`. Sync access handles are exclusive per file by spec
 * — opening a second one for the same file throws `NoModificationAllowedError`
 * (or `InvalidStateError` in some implementations). That IS the
 * contention signal; we just turn it into a clear error.
 *
 * The handle is held for the lifetime of the backend. When the
 * worker terminates (page navigation, tab close, explicit
 * `worker.terminate()`), the handle is released by the user-agent
 * and the lock auto-clears — no stale-lock recovery needed on the
 * browser side.
 */
const acquireOpfsLock = async (
    root: FileSystemDirectoryHandle,
): Promise<{ release(): Promise<void> } | null> => {
    const handle = await root.getFileHandle(LOCK_FILENAME, { create: true });
    const handleAsSync = handle as unknown as {
        createSyncAccessHandle?: () => Promise<{ close(): void; write(b: ArrayBufferView): number }>;
    };
    if (typeof handleAsSync.createSyncAccessHandle !== "function") {
        // Older browsers without sync handles can't enforce the lock.
        // Returning null disables it rather than crashing the backend.
        return null;
    }
    let sync: { close(): void; write(b: ArrayBufferView): number };
    try {
        sync = await handleAsSync.createSyncAccessHandle();
    } catch (err) {
        if (typeof DOMException !== "undefined" && err instanceof DOMException) {
            throw new Error(
                `OpfsBackend: lock contended (${err.name}). Another worker in this origin ` +
                `is currently using this OPFS root. Make sure prior workers were terminated ` +
                `before constructing a new backend.`,
            );
        }
        throw err;
    }
    // Stamp the handle with a timestamp + UA hint for forensic debugging
    // when a developer inspects OPFS in DevTools. Failure to write here
    // doesn't matter — the lock is held by the SyncAccessHandle itself.
    try {
        const stamp = JSON.stringify({
            acquiredAtMs: Date.now(),
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        });
        sync.write(new TextEncoder().encode(stamp));
    } catch {
        // Best-effort; ignore.
    }
    return {
        async release() {
            try {
                sync.close();
            } catch {
                // Worker is shutting down anyway.
            }
        },
    };
};

/**
 * OPFS backend. Must be constructed inside a dedicated worker because
 * the underlying RandomAccessFile uses sync access handles.
 */
export const createOpfsBackend = async (
    root: FileSystemDirectoryHandle,
): Promise<PersistenceBackend> => {
    const lock = await acquireOpfsLock(root);
    const open = async (relPath: string): Promise<RandomAccessFile> => {
        validateRelPath(relPath);
        const parts = splitPath(relPath);
        if (parts.length === 0) {
            throw new Error(`open: path resolves to empty: ${JSON.stringify(relPath)}`);
        }
        const filename = parts.pop()!;
        const dir = await resolveDir(root, parts, true);
        const fileHandle = await dir.getFileHandle(filename, { create: true });
        return createOpfsSyncFile(fileHandle);
    };

    const list = async (relPath: string): Promise<readonly string[]> => {
        const parts = relPath === "." ? [] : (validateRelPath(relPath), splitPath(relPath));
        try {
            const dir = await resolveDir(root, parts, false);
            const out: string[] = [];
            for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) {
                // Hide the lock file from listings at the root so user
                // code sees a consistent view independent of whether
                // locking is supported by the runtime.
                if (parts.length === 0 && name === LOCK_FILENAME) continue;
                out.push(name);
            }
            return out;
        } catch (err) {
            if (isNotFoundError(err)) return [];
            throw err;
        }
    };

    const remove = async (relPath: string): Promise<void> => {
        validateRelPath(relPath);
        const parts = splitPath(relPath);
        if (parts.length === 0) return;
        const filename = parts.pop()!;
        try {
            const dir = await resolveDir(root, parts, false);
            await dir.removeEntry(filename);
        } catch (err) {
            if (isNotFoundError(err)) return;
            throw err;
        }
    };

    const rename = async (from: string, to: string): Promise<void> => {
        // OPFS does not support rename directly. Fall back to copy+delete.
        // This loses atomicity; for checkpoint manifests we rely on writing
        // the manifest under a temporary name and using `move` on browsers
        // that support it. For now, copy-and-delete is sufficient.
        validateRelPath(from);
        validateRelPath(to);

        const fromHandle = await open(from);
        const size = await fromHandle.size();
        const data = await fromHandle.readAt(0, size);
        await fromHandle.close();

        const toHandle = await open(to);
        await toHandle.writeAt(0, data);
        await toHandle.close();

        await remove(from);
    };

    const dispose = async (): Promise<void> => {
        await lock?.release();
    };

    return { open, list, remove, rename, dispose };
};
