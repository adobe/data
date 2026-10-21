import { describe, expect, it } from "vitest";
import type * as Fixture from "./removal.fixture.js";

/** Removing systems placed on a joined worker: the cases, over the fixture built for node or from source. */
export const removalCases = (load: () => Promise<typeof Fixture>) => describe("removing systems on a joined worker", () => {
    it("never runs a system removed while the worker runs a task holding it, and both threads drop it", async () => {
        const fixture = await load();
        const { atRemove, after, placed, left, none } = await fixture.removedMidTask();
        expect(atRemove).toBeGreaterThanOrEqual(2);
        // The task in flight held `second` after `first`, which the worker ran no more of once its word was set.
        expect(after).toBe(atRemove);
        expect(placed).toEqual([2]);
        expect(left).toEqual([1]);
        expect(none).toEqual([0]);
    }, 30000);
});
