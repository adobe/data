import { describe, expect, it } from "vitest";
import type * as Fixture from "./observed-workers.fixture.js";

/** Tick stamps start on workers once observed: the cases, over the fixture built for node or from source. */
export const observedWorkersCases = (load: () => Promise<typeof Fixture>) => describe("tick stamps only where observed, on workers", () => {
    for (const wasm of [false, true]) {
        it(`start once an observer registers (${wasm ? "WASM" : "JS"} kernels)`, async () => {
            const fixture = await load();
            expect(await fixture.observedOnWorkers(wasm)).toEqual([[1], [2]]);
        });
    }
});
