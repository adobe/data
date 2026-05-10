// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Single-writer lock behavior for the OPFS backend. Sync access
// handles are exclusive per file by spec, so opening one on
// `lock.json` and holding it gives us mutex semantics that the
// user-agent automatically releases on worker termination.
//
// The OPFS backend can only be constructed inside a dedicated worker
// (sync access handles are worker-only by spec), so this suite drives
// a tiny test-only worker bootstrap that wraps acquire / release via
// postMessage.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const spawnLockWorker = (): Worker =>
    new Worker(new URL("./opfs-lock-test-worker.ts", import.meta.url), { type: "module" });

type AcquireResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

const wrapWorker = (worker: Worker) => {
    let nextId = 1;
    const pending = new Map<number, (msg: { cmd: string; error?: string }) => void>();
    worker.addEventListener("message", (ev: MessageEvent) => {
        const data = ev.data as { id: number; cmd: string; error?: string };
        const resolve = pending.get(data.id);
        if (resolve !== undefined) {
            pending.delete(data.id);
            resolve(data);
        }
    });

    const request = <T>(payload: Record<string, unknown>): Promise<T> => {
        const id = nextId++;
        return new Promise<T>(resolve => {
            pending.set(id, resolve as unknown as (m: { cmd: string }) => void);
            worker.postMessage({ ...payload, id });
        });
    };

    return {
        async acquire(dirName: string): Promise<AcquireResult> {
            const result = await request<{ cmd: "acquired" | "failed"; error?: string }>({
                cmd: "acquire",
                dirName,
            });
            return result.cmd === "acquired"
                ? { ok: true }
                : { ok: false, error: result.error ?? "unknown" };
        },
        async release(): Promise<void> {
            await request({ cmd: "release" });
        },
        terminate(): void {
            worker.terminate();
        },
    };
};

const removeIfExists = async (
    parent: FileSystemDirectoryHandle,
    name: string,
): Promise<void> => {
    try {
        await parent.removeEntry(name, { recursive: true } as FileSystemRemoveOptions);
    } catch {
        // best-effort
    }
};

describe("opfs-backend single-writer lock (in-worker)", () => {
    let parent: FileSystemDirectoryHandle;
    let dirName: string;
    const workers: Worker[] = [];

    beforeEach(async () => {
        parent = await navigator.storage.getDirectory();
        dirName = `lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    });

    afterEach(async () => {
        for (const w of workers) {
            w.terminate();
        }
        workers.length = 0;
        await removeIfExists(parent, dirName);
    });

    it("first worker acquires successfully", async () => {
        const w = spawnLockWorker();
        workers.push(w);
        const wrapped = wrapWorker(w);

        const r = await wrapped.acquire(dirName);
        expect(r.ok).toBe(true);

        await wrapped.release();
    });

    it("second worker on the same root fails to acquire while first holds", async () => {
        const wA = spawnLockWorker();
        const wB = spawnLockWorker();
        workers.push(wA, wB);
        const a = wrapWorker(wA);
        const b = wrapWorker(wB);

        const ra = await a.acquire(dirName);
        expect(ra.ok).toBe(true);

        const rb = await b.acquire(dirName);
        expect(rb.ok).toBe(false);
        if (!rb.ok) {
            expect(rb.error).toMatch(/lock contended/);
        }

        await a.release();
    });

    it("a second worker can acquire after the first releases", async () => {
        const wA = spawnLockWorker();
        workers.push(wA);
        const a = wrapWorker(wA);
        expect((await a.acquire(dirName)).ok).toBe(true);
        await a.release();

        const wB = spawnLockWorker();
        workers.push(wB);
        const b = wrapWorker(wB);
        expect((await b.acquire(dirName)).ok).toBe(true);
        await b.release();
    });

    it("a second worker can acquire after the first is terminated (auto-release)", async () => {
        const wA = spawnLockWorker();
        workers.push(wA);
        const a = wrapWorker(wA);
        expect((await a.acquire(dirName)).ok).toBe(true);

        // No release call. Just terminate. The OS / user-agent should
        // tear down the sync access handle on worker shutdown.
        wA.terminate();
        // Give the agent a tick to actually release. Browsers do this
        // synchronously in practice but a yield costs nothing.
        await new Promise(r => setTimeout(r, 50));

        const wB = spawnLockWorker();
        workers.push(wB);
        const b = wrapWorker(wB);
        const rb = await b.acquire(dirName);
        expect(rb.ok).toBe(true);
        await b.release();
    });
});
