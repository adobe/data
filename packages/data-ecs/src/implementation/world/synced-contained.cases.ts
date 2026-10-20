import { describe, expect, it } from "vitest";
import type * as Fixture from "./synced-contained.fixture.js";

/** A joined worker's synced system reading only resources: the cases, over the fixture built for node or from source in chromium. */
export const syncedContainedCases = (load: () => Promise<typeof Fixture>) => describe("synced systems reading only resources on a joined worker", () => {
    it("never hold the world's runs while one runs there, take its tick as it will, and run once more for the newest", async () => {
        const fixture = await load();
        const seen = await fixture.heldWhileTheWorldRuns();
        // The world ran on while the worker held its run, posting nothing it filters on: it ran once.
        expect(seen.quiet).toBe(true);
        expect(seen.first).toEqual([0, 1]);
        // Bumped twice while it held its run of 2, it ran once more, for the newest.
        expect(seen.bumped).toBe(true);
        expect(seen.second).toEqual([0, 1, 2, 4]);
    }, 30000);
});
