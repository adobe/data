// © 2026 Adobe. MIT License. See /LICENSE for details.

import { promises as fs } from "node:fs";
import { hostname } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import type { PersistenceBackend } from "../backend/persistence-backend.js";
import { validateRelPath } from "../backend/validate-rel-path.js";
import { createNodeFsFile } from "./node-fs-file.js";

/**
 * `NodeJS.ErrnoException` is a structural type with optional `code` —
 * Node throws plain `Error` instances at runtime, so `instanceof` is
 * unhelpful here. Duck-type the `code` field instead, then narrow.
 */
const isErrnoCode = (err: unknown, code: string): boolean =>
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === code;

const LOCK_FILENAME = "lock.json";

interface LockRecord {
    readonly pid: number;
    readonly hostname: string;
    readonly startedAtMs: number;
}

/**
 * Acquire a single-writer lock on `root`. Writes a JSON record
 * containing the current process's pid and start time to `lock.json`.
 *
 * Behavior:
 *   - File does not exist  → create it (exclusive `wx` flag).
 *   - File exists, owner pid is alive on this host  → throw.
 *   - File exists, owner pid is gone (or different host)  → treat as
 *     stale and overwrite. We DO NOT steal locks owned by a different
 *     host because that almost certainly means the data lives on a
 *     shared filesystem (NFS) and the other host is still writing.
 *
 * Returns the absolute lock path so the caller can release it.
 *
 * Race-condition tolerance: two processes may both observe a stale
 * lock and both try to overwrite. We use `flag: 'wx'` for the initial
 * acquire; if it fails with EEXIST after we've already concluded the
 * lock is stale, we use `flag: 'w'` to overwrite. The window where
 * both racers can write is small (microseconds) and the loser will
 * be detected at the NEXT call (writes happen sequentially through
 * the worker so cross-process interleaving is the only concern). For
 * stronger guarantees a flock(2)-based lock would be needed, but
 * Node's `fs` module does not surface flock without a native addon.
 */
const acquireNodeLock = async (root: string): Promise<string> => {
    const lockPath = join(root, LOCK_FILENAME);
    const myRecord: LockRecord = {
        pid: process.pid,
        hostname: hostname(),
        startedAtMs: Date.now(),
    };
    const recordBytes = Buffer.from(JSON.stringify(myRecord), "utf8");

    // Fast path: exclusive create. Wins the race in the common case
    // where no prior session left a lock behind.
    try {
        await fs.writeFile(lockPath, recordBytes, { flag: "wx" });
        return lockPath;
    } catch (err) {
        if (!isErrnoCode(err, "EEXIST")) throw err;
    }

    // A lock file already exists. Read it and decide whether to steal.
    let existing: LockRecord;
    try {
        const text = await fs.readFile(lockPath, "utf8");
        existing = JSON.parse(text) as LockRecord;
    } catch {
        // Unparseable lock file from an older / corrupt run; treat as stale.
        await fs.writeFile(lockPath, recordBytes, { flag: "w" });
        return lockPath;
    }

    if (existing.hostname !== myRecord.hostname) {
        throw new Error(
            `NodeFsBackend: refusing to acquire lock at ${lockPath}: ` +
            `owned by pid ${existing.pid} on host ${JSON.stringify(existing.hostname)} ` +
            `(this host is ${JSON.stringify(myRecord.hostname)}). ` +
            `If the data is on a shared filesystem and the other host crashed, ` +
            `delete ${LOCK_FILENAME} manually.`,
        );
    }

    if (existing.pid === process.pid) {
        // Re-entry from the same process. Refresh the timestamp and
        // continue. This handles dev-server reloads that re-import
        // without forking, and tests that recreate the backend.
        await fs.writeFile(lockPath, recordBytes, { flag: "w" });
        return lockPath;
    }

    // Different pid, same host. Probe with signal 0 (no-op signal that
    // verifies the process exists and we have permission to signal
    // it). If the process is gone, the lock is stale.
    let alive = false;
    try {
        process.kill(existing.pid, 0);
        alive = true;
    } catch (err) {
        // ESRCH = process does not exist. EPERM = exists but not ours,
        // which on most systems still means the process is alive.
        if (isErrnoCode(err, "EPERM")) alive = true;
    }

    if (alive) {
        throw new Error(
            `NodeFsBackend: another process (pid ${existing.pid}) is currently ` +
            `using ${root}. If you are sure that process has exited, delete ${LOCK_FILENAME}.`,
        );
    }

    // Stale lock; steal it.
    await fs.writeFile(lockPath, recordBytes, { flag: "w" });
    return lockPath;
};

/**
 * Node `fs` backend rooted at an absolute directory. The root must
 * exist and be a directory; create it ahead of time with `fs.mkdir`.
 *
 * All input paths are validated and resolved against the root; any
 * attempt to escape the root is rejected (defense in depth — the
 * `validateRelPath` rejection is the primary line of defense).
 */
/**
 * Options for {@link createNodeFsBackend}.
 */
export interface NodeFsBackendOptions {
    /**
     * Disable the single-writer lock file. Use only when an external
     * mechanism guarantees exclusive access (containerized single-
     * process services, ephemeral test directories, etc.).
     */
    readonly disableLock?: boolean;
}

export const createNodeFsBackend = async (
    rootPath: string,
    options: NodeFsBackendOptions = {},
): Promise<PersistenceBackend> => {
    const root = resolve(rootPath);
    // Ensure the root exists and is a directory. Failing fast here
    // surfaces configuration errors at startup rather than mid-write.
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
        throw new Error(`NodeFsBackend root is not a directory: ${root}`);
    }

    // Acquire the single-writer lock. If two processes try to mount
    // the same root, one of them must lose here — otherwise their
    // appendJournal() calls race on the file size and corrupt the WAL.
    const lockPath: string | null = options.disableLock
        ? null
        : await acquireNodeLock(root);

    const safeJoin = (relPath: string): string => {
        validateRelPath(relPath);
        const joined = resolve(join(root, relPath));
        // Final check: the resolved path must be inside the root. This is
        // belt-and-suspenders since validateRelPath already rejects '..'
        // segments and absolute inputs.
        if (joined !== root && !joined.startsWith(root + sep)) {
            throw new Error(`Resolved path escapes root: ${JSON.stringify(relPath)}`);
        }
        return joined;
    };

    return {
        async open(relPath) {
            const abs = safeJoin(relPath);
            await fs.mkdir(dirname(abs), { recursive: true });
            return createNodeFsFile(abs);
        },
        async list(relPath) {
            const target = relPath === "." ? root : safeJoin(relPath);
            try {
                const all = await fs.readdir(target);
                // Hide the lock file from listings so user code sees a
                // consistent view independent of whether locking is on.
                if (relPath === ".") return all.filter(name => name !== LOCK_FILENAME);
                return all;
            } catch (err) {
                if (isErrnoCode(err, "ENOENT")) return [];
                throw err;
            }
        },
        async remove(relPath) {
            const abs = safeJoin(relPath);
            try {
                await fs.unlink(abs);
            } catch (err) {
                if (isErrnoCode(err, "ENOENT")) return;
                throw err;
            }
        },
        async rename(from, to) {
            const fromAbs = safeJoin(from);
            const toAbs = safeJoin(to);
            await fs.mkdir(dirname(toAbs), { recursive: true });
            await fs.rename(fromAbs, toAbs);
        },
        async dispose() {
            if (lockPath === null) return;
            try {
                await fs.unlink(lockPath);
            } catch (err) {
                // Already gone — fine. Anything else, log and move on:
                // teardown should never throw, the OS will reap us.
                if (!isErrnoCode(err, "ENOENT")) {
                    // eslint-disable-next-line no-console
                    console.warn(`NodeFsBackend: failed to release lock at ${lockPath}:`, err);
                }
            }
        },
    };
};
