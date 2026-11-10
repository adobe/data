// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./fusion-workers.fixture.js";

/** Kernels a schedule would fuse, with pool workers: the cases, over the fixture built for node or from source. */
export const fusionWorkersCases = (load: () => Promise<typeof Fixture>) => describe("fusable kernels on workers", () => {
    it("compute what they compute one after another, each tier's kernels running at once on the pool", async () => {
        const fixture = await load();
        expect(await fixture.chainOnWorkers(true)).toEqual(await fixture.chainOnWorkers(false));
    });
});
