import { describe, expect, it } from "vitest";
import type * as Fixture from "./reductions.fixture.js";

/** Reductions fold every row once, deterministically, across workers: the cases, over the fixture built or from source. */
export const reductionsCases = (load: () => Promise<typeof Fixture>) => describe("reductions across workers", () => {
    for (const wasm of [true, false]) {
        it(`fold every row exactly once, in the same order each run (${wasm ? "WASM" : "JS"})`, async () => {
            const fixture = await load();
            const { rows, weightAt } = fixture;
            const runs = await fixture.reduced(wasm);
            for (const [count, largest] of runs) {
                expect(count).toBe(rows);
                expect(largest).toBe(Math.max(...Array.from({ length: rows }, (_, i) => weightAt(i))));
            }
            // Each piece folds into its own partial, combined in piece order, so float sums repeat bit for bit.
            const sums = runs.map(([, , total]) => total);
            expect(new Set(sums).size).toBe(1);
            const direct = Array.from({ length: rows }, (_, i) => weightAt(i)).reduce((total, value) => total + value, 0);
            expect(Math.abs((sums[0] ?? NaN) - direct)).toBeLessThan(1e-6 * rows);
        });
    }
});
