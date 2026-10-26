// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./lifetime.fixture.js";

/** What kernels hold across the pool: the cases, over the fixture built for node or from source. */
export const lifetimeCases = (load: () => Promise<typeof Fixture>) => describe("what a kernel holds", () => {
    it("lives as long as the kernel: new values of one kernel leave every table as it was, on every worker too", async () => {
        const fixture = await load();
        const { before, after, collected, total, ran } = await fixture.freshKernels(200);
        expect(total).toBe(fixture.rows - 1);
        // Its run counts the kernel and the workers it ran on.
        expect({ systems: ran.systems, workers: ran.workers, joined: ran.joined, gpu: ran.gpu }).toEqual({ systems: 1, workers: 2, joined: 0, gpu: false });
        expect(before.workers).toHaveLength(2);
        // Workers keep a kernel by its code, so new values of it add nothing there, collected or not.
        expect(after.workers).toEqual(before.workers);
        // The world's thread releases what a value held once it's collected, where a collector is exposed.
        if (collected) expect(after).toEqual(before);
    }, 120_000);
});
