// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./fusion-workers.fixture.js";

/** Kernels a schedule would fuse, with pool workers: the cases, over the fixture built for node or from source. */
export const fusionWorkersCases = (load: () => Promise<typeof Fixture>) => describe("fusable kernels on workers", () => {
    it("run fused on the pool, computing what they compute one after another", async () => {
        const fixture = await load();
        const fused = await fixture.chainOnWorkers(true);
        const apart = await fixture.chainOnWorkers(false);
        expect({ hp: fused.hp, shown: fused.shown }).toEqual({ hp: apart.hp, shown: apart.shown });
        expect(fused.kernels).toEqual(apart.kernels.map(kernels => kernels + 1));
    });
});
