// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createMemoryFile } from "./memory-file.js";
import type { PersistenceBackend } from "./persistence-backend.js";
import type { RandomAccessFile } from "./random-access-file.js";
import { validateRelPath } from "./validate-rel-path.js";

const normalize = (relPath: string): string => {
    // Strip './' prefixes and trailing slashes; collapse "//".
    return relPath
        .split("/")
        .filter(seg => seg !== "" && seg !== ".")
        .join("/");
};

/**
 * In-memory backend used by tests and the in-process service. Stores
 * file contents in a Map keyed by normalized relative path.
 */
export const createMemoryBackend = (): PersistenceBackend => {
    // Stored bytes per file. Each "open" returns a fresh handle that
    // syncs back to this map on writes.
    const store = new Map<string, Uint8Array>();

    const readSnapshot = (key: string): Uint8Array =>
        store.get(key) ?? new Uint8Array(0);

    const writeSnapshot = (key: string, bytes: Uint8Array): void => {
        store.set(key, bytes);
    };

    return {
        async open(relPath: string): Promise<RandomAccessFile> {
            validateRelPath(relPath);
            const key = normalize(relPath);
            const initial = readSnapshot(key);
            const inner = createMemoryFile(initial);
            return {
                async readAt(offset, length) {
                    return inner.readAt(offset, length);
                },
                async writeAt(offset, bytes) {
                    await inner.writeAt(offset, bytes);
                    const size = await inner.size();
                    writeSnapshot(key, await inner.readAt(0, size));
                },
                async appendAt(bytes) {
                    const newSize = await inner.appendAt(bytes);
                    writeSnapshot(key, await inner.readAt(0, newSize));
                    return newSize;
                },
                async size() {
                    return inner.size();
                },
                async truncate(length) {
                    await inner.truncate(length);
                    const size = await inner.size();
                    writeSnapshot(key, await inner.readAt(0, size));
                },
                async sync() {
                    await inner.sync();
                },
                async close() {
                    await inner.close();
                },
            };
        },
        async list(relPath: string): Promise<readonly string[]> {
            validateRelPath(relPath === "" ? "." : relPath);
            const prefix = normalize(relPath);
            const directKey = prefix.length === 0 ? "" : prefix + "/";
            const out = new Set<string>();
            for (const key of store.keys()) {
                if (prefix.length === 0 || key.startsWith(directKey)) {
                    const rest = prefix.length === 0 ? key : key.slice(directKey.length);
                    const head = rest.split("/")[0];
                    if (head !== undefined && head.length > 0) out.add(head);
                }
            }
            return [...out];
        },
        async remove(relPath: string): Promise<void> {
            validateRelPath(relPath);
            store.delete(normalize(relPath));
        },
        async rename(from: string, to: string): Promise<void> {
            validateRelPath(from);
            validateRelPath(to);
            const fromKey = normalize(from);
            const toKey = normalize(to);
            const data = store.get(fromKey);
            if (data === undefined) {
                throw new Error(`rename: source does not exist: ${JSON.stringify(from)}`);
            }
            store.set(toKey, data);
            store.delete(fromKey);
        },
    };
};
