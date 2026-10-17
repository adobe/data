import { describe, expect, it } from "vitest";
import { createMemory } from "./memory.js";
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
            pool.terminate();
        }
        finally {
            globalThis.Worker = original;
        }
    }, 5000);
});
