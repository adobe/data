import { describe, expect, it } from "vitest";
import { createMemory, type Memory } from "./memory.js";
import { createPool } from "./pool.js";

/** Workers whose script doesn't exist, so they fail to load. */
const BrokenWorker = class extends Worker {
    constructor() {
        super("/@missing/worker.js", { type: "module" });
    }
};

describe("createPool", () => {
    it("fails tasks on a worker that couldn't load, rather than hang", async () => {
        const original = globalThis.Worker;
        globalThis.Worker = BrokenWorker;
        try {
            const pool = createPool(1, createMemory(true));
            const first = await pool.request(0, { kind: "kernels", kernels: [] });
            expect(first.error?.message).toContain("failed");
            // Later tasks fail immediately too.
            const second = await pool.request(0, { kind: "kernels", kernels: [] });
            expect(second.error).toBe(first.error);
            await pool.terminate();
        }
        finally {
            globalThis.Worker = original;
        }
    }, 5000);

    it("releases its control state when terminated, so pools of new sizes don't grow what the arena holds", async () => {
        const arena = createMemory(true);
        /** Bytes allocated and not yet freed. */
        let held = 0;
        const counting: Memory = {
            ...arena,
            allocate: bytes => { held += bytes; return arena.allocate(bytes); },
            free: (offset, bytes) => { held -= bytes; arena.free(offset, bytes); },
        };
        for (let size = 1; size <= 4; size++) {
            const pool = createPool(size, counting);
            // Open each worker's window, so each has used the control lines being released.
            await Promise.all(pool.claimed(0, size, { kernel: -1, archetype: -1, start: 0, end: 0, tick: 0, lastRun: 0, scalars: [], partials: -1, partialBytes: 0 }, 1));
            expect(held).toBeGreaterThan(0);
            await pool.terminate();
            expect(held).toBe(0);
        }
    }, 10000);
});
