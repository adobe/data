import { describe, expect, it } from "vitest";
import type * as Fixture from "./transfers.fixture.js";

/** Transfers between joined workers: the cases, over the fixture built for node or from source in chromium. */
export const transfersCases = (load: () => Promise<typeof Fixture>) => describe("transfers between joined workers", () => {
    it("move runs' Transferable input to the joined thread their system runs on, in call order", async () => {
        const fixture = await load();
        const { moved, received } = await fixture.moves(10, 1 << 20);
        expect(moved).toEqual({ kind: "moved", detached: 10, greeted: "anchor", failures: 0 });
        expect(received).toEqual(Array.from({ length: 10 }, (_, k) => [1 << 20, k + 1, k]));
    }, 30000);
    it("hold a run whose input hasn't been received yet, and that thread's later runs, while the world's own runs go on", async () => {
        const fixture = await load();
        const seen = await fixture.late(800);
        expect(seen.posted).toEqual({ kind: "posted", detached: true });
        expect(seen.worldRun).toBeLessThan(400);
        expect(seen.orderWhileBlocked).toBe(0);
        expect(seen.settled).toEqual({ kind: "settled", failures: 0 });
        expect({ stores: seen.stores, marks: seen.marks }).toEqual({ stores: [0], marks: [[1, 1], [2, 2], [3, 3]] });
    }, 30000);
    it("release a value whose command drops, on its thread", async () => {
        const fixture = await load();
        const { dropped, there, here } = await fixture.drops();
        // Where the platform has bitmaps, a browser, one dropped there and one here, both closed; where it tells a port
        // its other end closed, node, the port dropped there.
        const bitmaps = there.length > 1;
        expect(dropped).toEqual({ kind: "dropped", dropped: bitmaps ? [1, 1, 1] : [1], closed: bitmaps ? expect.any(Boolean) : true, widths: bitmaps ? [0, 0] : [] });
        expect({ there, here }).toEqual(bitmaps ? { there: [-1, 0], here: [0] } : { there: [-1], here: [] });
    }, 30000);
});
