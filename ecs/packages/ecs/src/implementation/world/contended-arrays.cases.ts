// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./contended-arrays.fixture.js";

/** A kernel writing a small typed array's elements, with pool workers: the cases, over the fixture built for node or from source. */
export const contendedArraysCases = (load: () => Promise<typeof Fixture>) => describe("kernels writing a small typed array, with workers", () => {
    it("run on one thread, their rows writing in order", async () => {
        const { written, inOrder } = await (await load()).cellsOnWorkers();
        expect(written).toEqual(inOrder);
    });
});
