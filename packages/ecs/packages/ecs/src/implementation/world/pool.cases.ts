// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./pool.fixture.js";

/** The pool over its ports: the cases, over the fixture built for node or from source. */
export const poolCases = (load: () => Promise<typeof Fixture>) => describe("createPool", () => {
    it("fails tasks on a worker that couldn't load, rather than hang", async () => {
        const fixture = await load();
        const { message, same } = await fixture.unloadable();
        expect(message).toContain("failed");
        // Later tasks fail immediately too.
        expect(same).toBe(true);
    }, 30000);

    it("releases its control state when terminated, so pools of new sizes don't grow what the arena holds", async () => {
        const fixture = await load();
        for (const [before, after] of await fixture.released()) {
            expect(before).toBeGreaterThan(0);
            expect(after).toBe(0);
        }
    }, 30000);

    it("fails every task of a worker whose memory is shorter than the length the world stored", async () => {
        const fixture = await load();
        const [before, during, after] = await fixture.shortMemory();
        expect(before).toBeUndefined();
        expect(during).toContain("short of");
        // The worker stays broken, since views it made may be stale.
        expect(after).toContain("short of");
    }, 30000);
});
