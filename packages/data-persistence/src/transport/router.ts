// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { PersistenceBackend } from "../backend/persistence-backend.js";
import type { RandomAccessFile } from "../backend/random-access-file.js";
import type { PersistOp } from "./transport.js";

const ENTITY_LOCATION_FILE = "entity-location.bin";
const JOURNAL_FILE = "journal.bin";
const META_FILE = "meta.json";
// Packed entity-location entry: u32 archetypeId (we reserve the high
// bit as "deleted") + u32 rowIndex. 8 bytes per entity, indexed by the
// absolute value of the entity id - 1 (entities are 1-indexed in the
// store). Deletions are recorded by setting all bytes to 0xff.
const ELT_STRIDE = 8;

const columnPath = (archetypeId: number, component: string): string =>
    `archetypes/${archetypeId}/${component}.bin`;

/**
 * Worker-side router that translates {@link PersistOp} messages into
 * {@link PersistenceBackend} operations. Owns a small handle cache so
 * repeated writes to the same column reuse one open file.
 */
export interface PersistRouter {
    handle(op: PersistOp): Promise<unknown>;
    close(): Promise<void>;
}

export const createPersistRouter = (backend: PersistenceBackend): PersistRouter => {
    const fileCache = new Map<string, RandomAccessFile>();
    // Concurrent opens for the same path must share a single in-flight
    // backend.open promise; otherwise each caller gets its own handle
    // and writes interleave (the snapshotting memory backend in
    // particular surfaces this as lost data).
    const inflightOpens = new Map<string, Promise<RandomAccessFile>>();

    const openCached = (relPath: string): Promise<RandomAccessFile> => {
        const existing = fileCache.get(relPath);
        if (existing !== undefined) return Promise.resolve(existing);
        const inflight = inflightOpens.get(relPath);
        if (inflight !== undefined) return inflight;
        const pending = backend.open(relPath).then((file) => {
            fileCache.set(relPath, file);
            inflightOpens.delete(relPath);
            return file;
        });
        inflightOpens.set(relPath, pending);
        return pending;
    };

    const handle = async (op: PersistOp): Promise<unknown> => {
        switch (op.kind) {
            case "writeColumnSlice": {
                const file = await openCached(columnPath(op.archetypeId, op.component));
                await file.writeAt(op.rowOffset, new Uint8Array(op.bytes));
                return undefined;
            }
            case "appendJournal": {
                const file = await openCached(JOURNAL_FILE);
                return file.appendAt(new Uint8Array(op.bytes));
            }
            case "writeEntityLocation": {
                if (op.entity < 0) {
                    throw new Error(`writeEntityLocation: non-persistent entity not persistable (entity=${op.entity})`);
                }
                const file = await openCached(ENTITY_LOCATION_FILE);
                const entry = new ArrayBuffer(ELT_STRIDE);
                const view = new DataView(entry);
                view.setUint32(0, op.archetypeId, true);
                view.setUint32(4, op.rowIndex, true);
                // Entities are 0-indexed; offset = entity * stride.
                await file.writeAt(op.entity * ELT_STRIDE, new Uint8Array(entry));
                return undefined;
            }
            case "deleteEntityLocation": {
                if (op.entity < 0) {
                    throw new Error(`deleteEntityLocation: non-persistent entity not persistable (entity=${op.entity})`);
                }
                const file = await openCached(ENTITY_LOCATION_FILE);
                const tombstone = new Uint8Array(ELT_STRIDE).fill(0xff);
                await file.writeAt(op.entity * ELT_STRIDE, tombstone);
                return undefined;
            }
            case "writeJournalSnapshot": {
                // Always a full rewrite at offset 0; truncate removes any
                // stale tail from a previous checkpoint with more rows.
                const path = columnPath(op.archetypeId, op.component);
                const file = await openCached(path);
                const bytes = new Uint8Array(op.bytes);
                await file.writeAt(0, bytes);
                await file.truncate(bytes.byteLength);
                return undefined;
            }
            case "checkpoint": {
                // Atomic-ish: write the manifest to a temp file, then rename.
                // OPFS rename is implemented as copy+delete in our backend
                // (lossy of atomicity); on POSIX the rename is atomic.
                const text = JSON.stringify(op.manifest);
                const bytes = new TextEncoder().encode(text);
                const tmp = META_FILE + ".tmp";
                const tmpFile = await backend.open(tmp);
                await tmpFile.truncate(0);
                await tmpFile.writeAt(0, bytes);
                await tmpFile.sync();
                await tmpFile.close();
                await backend.remove(META_FILE);
                await backend.rename(tmp, META_FILE);
                // Truncate the journal once the new manifest is durable.
                const journal = await openCached(JOURNAL_FILE);
                await journal.truncate(0);
                await journal.sync();
                return undefined;
            }
            case "readFile": {
                // Open via openCached so subsequent writes share the handle.
                // Backends create-on-open (matching POSIX O_CREAT semantics);
                // non-existence is signaled by a zero-byte size. Callers that
                // need to distinguish missing from empty should use `listDir`.
                const file = await openCached(op.path);
                const size = await file.size();
                if (size === 0) return { bytes: new ArrayBuffer(0) };
                const data = await file.readAt(0, size);
                // Copy into a fresh ArrayBuffer so it is transferable
                // across postMessage and never aliases an internal buffer.
                const out = new ArrayBuffer(data.byteLength);
                new Uint8Array(out).set(data);
                return { bytes: out };
            }
            case "listDir": {
                try {
                    const entries = await backend.list(op.path);
                    return { entries };
                } catch {
                    return { entries: [] };
                }
            }
            default: {
                const exhaustive: never = op;
                throw new Error(`Unknown PersistOp kind: ${(exhaustive as { kind: string }).kind}`);
            }
        }
    };

    const close = async (): Promise<void> => {
        for (const file of fileCache.values()) {
            await file.close();
        }
        fileCache.clear();
        // Release process-wide backend resources (lock files, etc.) AFTER
        // file handles are closed: backends that use a sync access handle
        // as their lock would otherwise see a stale handle still open
        // when they try to release it.
        await backend.dispose?.();
    };

    return { handle, close };
};
