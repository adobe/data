import { describe, expect, it } from "vitest";
import type * as Fixture from "./index-build.fixture.js";

/** Indexes built again across the pool: the cases, over the fixture built for node or from source. */
export const indexBuildCases = (load: () => Promise<typeof Fixture>) => describe("index builds across the pool", () => {
    it("give the same index whatever the number of workers, as this thread alone builds it, and what the rows hold", async () => {
        const fixture = await load();
        const alone = await fixture.simulate(0);
        expect(alone.folds).toEqual(alone.expected);
        expect(alone.failures.length).toBeGreaterThan(0);
        expect(alone.pooled).toBe(0);
        for (const threads of [1, 2, 3]) {
            const built = await fixture.simulate(threads);
            expect(built.folds).toEqual(alone.folds);
            expect(built.failures).toEqual(alone.failures);
            // Both builds of the grid and the one of the serials, whose keys don't change, ran across the pool.
            expect(built.pooled).toBe(3);
        }
    });
});
