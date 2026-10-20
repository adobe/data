import { describe, expect, it } from "vitest";
import type * as Fixture from "./synced-joined.fixture.js";

/** Synced systems a joined worker adds: the cases, over the fixture built for node or from source in chromium. */
export const syncedJoinedCases = (load: () => Promise<typeof Fixture>) => describe("synced systems a joined worker adds", () => {
    it("read every row as of one sync point while the world ticks on writing them, from a copy once a writer is ready first", async () => {
        const fixture = await load();
        const seen = await fixture.continuous("rows");
        expect({ wrong: seen.wrong, fewest: seen.fewest, most: seen.most }).toEqual({ wrong: 0, fewest: 1000, most: 1000 });
        expect(seen.switched).toBeGreaterThan(0);
        // Stalled, it fell behind, and ran once for the newest sync point.
        expect(seen.runs).toBeLessThan(seen.ticks);
        // Its thread returned to its event loop meanwhile.
        expect(seen.timers).toBeGreaterThan(0);
    }, 30000);
    it("look every row up as of one sync point while the world ticks on writing them, the writers waiting for it", async () => {
        const fixture = await load();
        const seen = await fixture.continuous("lookups");
        expect({ wrong: seen.wrong, fewest: seen.fewest, most: seen.most }).toEqual({ wrong: 0, fewest: 1000, most: 1000 });
        expect(seen.runs).toBeGreaterThan(10);
    }, 30000);
});
