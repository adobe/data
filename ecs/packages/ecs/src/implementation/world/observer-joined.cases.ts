// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./observer-joined.fixture.js";

/** Observer systems a joined worker adds: the cases, over the fixture built for node or from source in chromium. */
export const observerJoinedCases = (load: () => Promise<typeof Fixture>) => describe("observer systems a joined worker adds", () => {
    it("read every row as of one sync point while the world ticks on writing them, from a copy once a writer is ready first", async () => {
        const fixture = await load();
        const seen = await fixture.continuous("rows");
        expect({ failures: seen.failures, wrong: seen.wrong, fewest: seen.fewest, most: seen.most }).toEqual({ failures: [], wrong: 0, fewest: 1000, most: 1000 });
        // Each run a writer was ready for partway read the rest from its copy.
        expect(seen.partway?.released.length).toBe(5);
        expect(seen.partway?.switched).toBe(5);
        // Held, it fell behind, and ran once, for the newest sync point.
        expect(seen.behind?.behind).toEqual([seen.behind?.newest]);
        // Its thread returned to its event loop meanwhile.
        expect(seen.timers).toBeGreaterThan(0);
    }, 30000);
    it("look every row up as of one sync point while the world ticks on writing them, the writers waiting for it", async () => {
        const fixture = await load();
        const seen = await fixture.continuous("lookups");
        expect({ failures: seen.failures, wrong: seen.wrong, fewest: seen.fewest, most: seen.most }).toEqual({ failures: [], wrong: 0, fewest: 1000, most: 1000 });
        expect(seen.runs).toBeGreaterThan(10);
    }, 30000);
    it("read a string resource as of their sync point, though the world's runs go on writing it while one runs", async () => {
        const fixture = await load();
        expect(await fixture.mottoHeld()).toEqual([{ round: 1, motto: "motto 1" }]);
    }, 30000);
});
