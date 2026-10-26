// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./pool-size.fixture.js";

/** The `workers` resource sizes the pool: the cases, over the fixture built for node or from source. */
export const poolSizeCases = (load: () => Promise<typeof Fixture>) => describe("the workers resource", () => {
    it("is null by default, the platform's choice: a worker per hardware thread but the world's", async () => {
        const fixture = await load();
        const platform = fixture.platformCount();
        expect(platform).toBe(Math.max(1, navigator.hardwareConcurrency - 1));
        expect(await fixture.byDefault()).toEqual({ resource: null, started: platform });
    });
    it("honors a number, and null again gives the platform's choice", async () => {
        const fixture = await load();
        expect((await fixture.resized(1, [null])).started).toEqual([1, 1 + fixture.platformCount()]);
    });
    it("starts the pool only once a kernel has rows enough for workers", async () => {
        const fixture = await load();
        const { started, values } = await fixture.whenWarranted();
        expect(started).toEqual([0, fixture.platformCount()]);
        expect(values).toEqual([0, 4, 8, 12]);
    });
    it("starts no pool for rows no kernel runs over", async () => {
        expect(await (await load()).unmatched()).toBe(0);
    });
    it("reports a kernel that fails to load on workers as the pool starts, and runs it here from then on", async () => {
        const fixture = await load();
        const { failures, loads, values } = await fixture.failedLoad();
        expect(failures[0]).toEqual([expect.stringMatching(/^The kernel pool's workers failed: .*no kernel here/)]);
        expect(failures[1]).toEqual([]);
        expect(loads[1]).toBe(loads[0]);
        expect(values).toEqual([0, 4, 8, 12]);
    });
    it("sizes the kernel pool at the next sync point, with the same results", async () => {
        const fixture = await load();
        const { started, values } = await fixture.resized(2, [3, 0]);
        expect(started).toEqual([2, 5, 5]);
        expect(values.slice(0, 4)).toEqual([0, 8, 16, 24]);
        expect(values[4095]).toBe(4095 * 8);
    });
});
