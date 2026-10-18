import { describe, expect, it } from "vitest";
import type * as Fixture from "./workers.fixture.js";

/** Kernels on workers give the main thread's results: the cases, over the fixture built for node or from source. */
export const workersCases = (load: () => Promise<typeof Fixture>) => describe("workers", () => {
    it("give the same results as the main thread alone", async () => {
        const fixture = await load();
        // JS kernels on the main thread alone, against WASM kernels (where a kernel has one) on workers.
        const alone = await fixture.simulate(0, false);
        expect(alone.rows.some(row => row.includes("true"))).toBe(true);
        const pooled = await fixture.simulate(3);
        expect(pooled.rows).toEqual(alone.rows);
        // Archetypes of at least 64 rows ran on the workers every frame.
        expect(pooled.tasks).toBeGreaterThanOrEqual(12 * 3);
    });

    it("give the same SIMD results as the main thread alone, since chunks start on 16-row boundaries", async () => {
        const fixture = await load();
        expect((await fixture.simulate(3, true, true)).rows).toEqual((await fixture.simulate(0, true, true)).rows);
    });

    it("keep tasks in order when a worker's ring overflows, and split evenly once every claim counter is in flight", async () => {
        const fixture = await load();
        // One worker gets a task per archetype: 512, eight times its ring and twice the claim counters.
        expect(await fixture.scattered(1)).toEqual(await fixture.scattered(0));
    });

    it("merge chunk commands in the same order as the main thread", async () => {
        const fixture = await load();
        expect(await fixture.ordered(3)).toEqual(await fixture.ordered(0));
    });

    it("stage kernel spawns from every worker and the main thread in chunk order, whatever the worker count", async () => {
        const fixture = await load();
        const rows = Array.from({ length: 1_015 }, (_, i) => i);
        // Storage order is the spawns' order, row by row over the archetypes, wherever each chunk ran.
        const alone = await fixture.spawns(0, false);
        expect(alone).toEqual([1_015, rows.map(i => [i, -i]), rows.map(() => null), rows.map(() => true)]);
        for (const count of [1, 2, 7]) expect(await fixture.spawns(count, false)).toEqual(alone);
        // Spawned entities moved in the same sync point arrive in the order of the commands that moved them.
        const edited = await fixture.spawns(0, true);
        expect(edited).toEqual([1_015, rows.map(i => [i, -i]), rows.map(i => [i, 1]), rows.map(() => null)]);
        for (const count of [1, 2, 7]) expect(await fixture.spawns(count, true)).toEqual(edited);
    });

    it("can't touch the resource entity", async () => {
        const fixture = await load();
        expect(await fixture.unlinked()).toBe(0.25);
    });

    it("are terminated by dispose", async () => {
        const fixture = await load();
        const { started, terminated, after } = await fixture.disposed();
        expect(started).toBe(2);
        expect(terminated).toBe(2);
        expect(after).toContain("disposed");
    });
});
