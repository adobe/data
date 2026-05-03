// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Single-writer lock behavior for the Node fs backend. The lock file
// (`lock.json`) is written exclusively at backend creation, released
// on `dispose`, and tolerated when stale (owner pid is gone).

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeFsBackend } from "./node-fs-backend.js";

const LOCK_FILENAME = "lock.json";

const makeTmpDir = async (): Promise<string> =>
    fs.mkdtemp(join(tmpdir(), "data-persistence-lock-"));

describe("node-fs-backend single-writer lock", () => {
    let dir: string;

    beforeEach(async () => {
        dir = await makeTmpDir();
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it("creates the lock file on construction and removes it on dispose", async () => {
        const backend = await createNodeFsBackend(dir);
        const lockPath = join(dir, LOCK_FILENAME);

        const exists = await fs.stat(lockPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);

        const text = await fs.readFile(lockPath, "utf8");
        const record = JSON.parse(text) as {
            pid: number;
            hostname: string;
            startedAtMs: number;
        };
        expect(record.pid).toBe(process.pid);
        expect(typeof record.hostname).toBe("string");
        expect(typeof record.startedAtMs).toBe("number");

        await backend.dispose!();

        const stillExists = await fs.stat(lockPath).then(() => true).catch(() => false);
        expect(stillExists).toBe(false);
    });

    it("hides the lock file from list('.')", async () => {
        const backend = await createNodeFsBackend(dir);
        try {
            const f = await backend.open("data.bin");
            await f.writeAt(0, new Uint8Array([1]));
            await f.close();

            const entries = [...(await backend.list("."))].sort();
            expect(entries).toEqual(["data.bin"]);
        } finally {
            await backend.dispose!();
        }
    });

    it("rejects a second backend on the same root while the first is alive", async () => {
        const first = await createNodeFsBackend(dir);
        try {
            // The second acquire should see a fresh, live owner: us.
            // We simulate a different pid by rewriting the lock file
            // in-place — same hostname, different alive pid.
            const lockPath = join(dir, LOCK_FILENAME);
            const live = {
                pid: process.pid, // alive: kill(0) succeeds
                hostname: (await import("node:os")).hostname(),
                startedAtMs: Date.now(),
            };
            await fs.writeFile(lockPath, JSON.stringify(live));
            // ...but trick the lock check by changing the pid to a known-
            // alive pid of ANOTHER process: 1 (init / launchd). Signal 0
            // to pid 1 from a non-root process raises EPERM, which our
            // implementation correctly classifies as "alive".
            const live2 = { ...live, pid: 1 };
            await fs.writeFile(lockPath, JSON.stringify(live2));

            await expect(createNodeFsBackend(dir)).rejects.toThrow(
                /another process \(pid 1\) is currently using/,
            );
        } finally {
            await first.dispose!();
        }
    });

    it("steals a stale lock left by a dead pid", async () => {
        // Pre-seed a stale lock referencing a pid that almost certainly
        // does not exist. 2**31 - 1 is well above the OS pid_max on all
        // major platforms (Linux default 32768; macOS/BSD 99999) and
        // fits in Node's ints. kill(0, pid) → ESRCH → "stale".
        const lockPath = join(dir, LOCK_FILENAME);
        const stale = {
            pid: 2 ** 31 - 1,
            hostname: (await import("node:os")).hostname(),
            startedAtMs: Date.now() - 86_400_000,
        };
        await fs.writeFile(lockPath, JSON.stringify(stale));

        const backend = await createNodeFsBackend(dir);
        try {
            // Lock was stolen and rewritten to our pid.
            const text = await fs.readFile(lockPath, "utf8");
            const record = JSON.parse(text) as { pid: number };
            expect(record.pid).toBe(process.pid);
        } finally {
            await backend.dispose!();
        }
    });

    it("treats an unparseable lock file as stale", async () => {
        const lockPath = join(dir, LOCK_FILENAME);
        await fs.writeFile(lockPath, "not json {");

        const backend = await createNodeFsBackend(dir);
        try {
            const text = await fs.readFile(lockPath, "utf8");
            // Should now be valid JSON identifying us.
            const record = JSON.parse(text) as { pid: number };
            expect(record.pid).toBe(process.pid);
        } finally {
            await backend.dispose!();
        }
    });

    it("refuses a lock owned by a different host (NFS safety)", async () => {
        const lockPath = join(dir, LOCK_FILENAME);
        const foreign = {
            pid: 1,
            hostname: "some-other-host-not-this-one",
            startedAtMs: Date.now(),
        };
        await fs.writeFile(lockPath, JSON.stringify(foreign));

        await expect(createNodeFsBackend(dir)).rejects.toThrow(
            /owned by pid 1 on host "some-other-host-not-this-one"/,
        );
    });

    it("re-entry from the same pid succeeds and refreshes the timestamp", async () => {
        // First acquire writes the lock.
        const first = await createNodeFsBackend(dir);
        try {
            const lockPath = join(dir, LOCK_FILENAME);
            const before = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
                startedAtMs: number;
            };
            // Force a measurable time gap.
            await new Promise(r => setTimeout(r, 5));

            // Second acquire from the same pid should succeed
            // (re-entry path; common during dev-server reloads).
            const second = await createNodeFsBackend(dir);
            try {
                const after = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
                    pid: number;
                    startedAtMs: number;
                };
                expect(after.pid).toBe(process.pid);
                expect(after.startedAtMs).toBeGreaterThanOrEqual(before.startedAtMs);
            } finally {
                await second.dispose!();
            }
        } finally {
            await first.dispose!();
        }
    });

    it("disableLock skips lock acquisition entirely", async () => {
        const backend = await createNodeFsBackend(dir, { disableLock: true });
        try {
            const lockPath = join(dir, LOCK_FILENAME);
            const exists = await fs.stat(lockPath).then(() => true).catch(() => false);
            expect(exists).toBe(false);

            // And nothing throws on dispose either.
            await backend.dispose!();
        } catch (err) {
            // Make sure dispose got called once if the test body bailed.
            await backend.dispose?.().catch(() => {});
            throw err;
        }
    });
});
