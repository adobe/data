import { describe, expect, it } from "vitest";
import type * as Fixture from "./index-workers.fixture.js";

/** Kernels looking up through indexes across workers: the cases, over the fixture built for node or from source. */
export const indexWorkersCases = (load: () => Promise<typeof Fixture>) => describe("index lookups on workers", () => {
    it.each([[true], [false]])("give what the main thread alone gives, WASM %s", async wasm => {
        const fixture = await load();
        const alone = await fixture.simulate(0, wasm);
        const one = await fixture.simulate(1, wasm);
        const three = await fixture.simulate(3, wasm);
        expect(one.rows).toEqual(alone.rows);
        expect(three.rows).toEqual(alone.rows);
        expect(three.tasks).toBeGreaterThan(0);
        // Targets' tallies through the index without a key: its length in millions, then a stride of its weights.
        expect(three.rows.filter(row => /^\[\d+,-?\d+,\d{7,}\]$/.test(row)).length).toBeGreaterThan(900);
    });
});
