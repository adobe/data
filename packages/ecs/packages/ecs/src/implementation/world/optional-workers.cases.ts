// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./optional-workers.fixture.js";

/** Optional components in kernels on workers: the cases, over the fixture built for node. */
export const optionalWorkersCases = (load: () => Promise<typeof Fixture>) => describe("optional components in kernels on workers", () => {
    for (const wasm of [false, true]) {
        it(`read undefined in archetypes that lack them, and their values where they don't (${wasm ? "WASM" : "JS"})`, async () => {
            const fixture = await load();
            expect(await fixture.movedOnWorkers(wasm)).toEqual({ moved: 200 * 15, still: 200 });
        });
        it(`fail their system where a kernel assigns one an entity lacks (${wasm ? "WASM" : "JS"})`, async () => {
            const fixture = await load();
            const failures = await fixture.assignedOnWorkers(wasm);
            expect(failures.length).toBeGreaterThan(0);
            expect(new Set(failures)).toEqual(new Set([`An entity lacks "optionalWorkersTest/velocity", optional in its system: add it with commands.add rather than assigning it.`]));
        });
    }
});
