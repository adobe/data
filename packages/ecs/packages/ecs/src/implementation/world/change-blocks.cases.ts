// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./change-blocks.fixture.js";

/** Chunk and block ticks on workers: the cases, over the fixture built for node or from source. */
export const changeBlocksCases = (load: () => Promise<typeof Fixture>) => describe("chunk and block ticks on workers", () => {
    for (const wasm of [false, true]) {
        it(`let readers find the rows a kernel on workers wrote (${wasm ? "WASM" : "JS"} kernels)`, async () => {
            const fixture = await load();
            const expected = [5, 2048 + 5 * 64 + 9, 4499];
            expect(await fixture.foundOnWorkers(wasm)).toEqual({ kernel: expected, main: expected });
        });
    }
});
