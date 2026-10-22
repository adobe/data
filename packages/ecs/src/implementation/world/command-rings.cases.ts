import { describe, expect, it } from "vitest";
import type * as Fixture from "./command-rings.fixture.js";

/** Workers' commands and spawns through their command rings: the cases, over the fixture built for node or from source. */
export const commandRingsCases = (load: () => Promise<typeof Fixture>) => describe("command rings", () => {
    it("spill a task's commands past the ring's size in order, and grow the ring at the sync point", async () => {
        const fixture = await load();
        const alone = await fixture.overflow(0);
        for (const count of [1, 2, 7]) {
            const { rows, first, second } = await fixture.overflow(count);
            expect(rows).toEqual(alone.rows);
            expect(first).toBeGreaterThan(0);
            expect(second).toBe(first);
        }
    });

    it("apply a failed task's commands and spawns from before its failure", async () => {
        const fixture = await load();
        const alone = await fixture.failed(0);
        const { failures, weights, extents, spawned } = alone;
        expect(failures).toEqual(["commandRingsTest/failing"]);
        // Every row but the first, which has no target, added its weight and spawned before reading its target; only
        // the last one's target is none.
        expect(weights).toEqual([null, ...Array.from({ length: 999 }, (_, i) => i + 1)]);
        expect(extents.filter(value => value !== "null")).toHaveLength(998);
        expect(spawned).toEqual(Array.from({ length: 999 }, (_, i) => i + 1));
        for (const count of [1, 2, 7]) expect(await fixture.failed(count)).toEqual(alone);
    });

    it("return the reservation positions a task's block left unused to the free list once", async () => {
        const fixture = await load();
        for (const count of [0, 1, 2, 7]) expect(await fixture.returned(count)).toEqual({ spawned: 5 * 64 + 5_000, distinct: 5 * 64 + 5_000 });
    });

    it("give object components their start, null or a number", async () => {
        const fixture = await load();
        const rows = Array.from({ length: 1_000 }, (_, i) => i);
        const alone = await fixture.objectValues(0);
        expect(alone).toEqual([
            rows.map(() => "unnamed"), rows.map(() => null), rows,
            rows.map(() => "unnamed"), rows.map(() => null), rows.map(() => null),
        ]);
        for (const count of [1, 2, 7]) expect(await fixture.objectValues(count)).toEqual(alone);
    });
});
