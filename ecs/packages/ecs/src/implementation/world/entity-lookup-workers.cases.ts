// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./entity-lookup-workers.fixture.js";

/** Kernels' lookups by entity with `changed` across workers: the cases, over the fixture built for node or from source. */
export const entityLookupWorkersCases = (load: () => Promise<typeof Fixture>) => describe("kernels' lookups by entity with changed on workers", () => {
    it.each([[true], [false]])("give what a main-thread system gives, WASM %s", async wasm => {
        const fixture = await load();
        const alone = await fixture.simulate(0, wasm);
        const one = await fixture.simulate(1, wasm);
        const three = await fixture.simulate(3, wasm);
        expect(alone.agree).toBe(true);
        expect(one.agree).toBe(true);
        expect(three.agree).toBe(true);
        expect(one.rows).toEqual(alone.rows);
        expect(three.rows).toEqual(alone.rows);
        expect(three.tasks).toBeGreaterThan(0);
    });
});
