// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./up-workers.fixture.js";

/** `up` runs depth by depth across workers: the cases, over the fixture built for node or from source. */
export const upWorkersCases = (load: () => Promise<typeof Fixture>) => describe("up", () => {
    it("runs depth by depth across workers, as on the main thread alone", async () => {
        const fixture = await load();
        const alone = await fixture.simulate(0, false);
        const parallel = await fixture.simulate(2, true);
        expect(parallel.values).toEqual(alone.values);
        expect(parallel.windows).toBeGreaterThan(0);
    });
});
