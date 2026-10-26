// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./shared-workers.fixture.js";

/** Shared components in kernels on workers: the cases, over the fixture built for node. */
export const sharedWorkersCases = (load: () => Promise<typeof Fixture>) => describe("shared components in kernels on workers", () => {
    for (const wasm of [false, true]) {
        it(`take each call's archetype's values, giving the body's results bit for bit (${wasm ? "WASM" : "JS"})`, async () => {
            const fixture = await load();
            const { kernel, written } = await fixture.computedOnWorkers(wasm);
            expect(kernel).toEqual(written);
            expect(written).toHaveLength(400);
        });
        it(`run only the archetypes where passes (${wasm ? "WASM" : "JS"})`, async () => {
            const fixture = await load();
            // A third of the rows have a negative scale; the first row's value is 0 either way.
            expect(await fixture.whereOnWorkers(wasm)).toEqual({ written: 134, left: 266 });
        });
    }
});
