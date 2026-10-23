// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./remote-finalizers.fixture.js";

/** Finalizers on a joined worker: the cases, over the fixture built for node or from source. */
export const remoteFinalizersCases = (load: () => Promise<typeof Fixture>) => describe("finalizers on a joined worker", () => {
    it("run once per stop there, as an inline world's do, with its objects and the structs before each sync point applied", async () => {
        const fixture = await load();
        const { expected, actual } = await fixture.sameStops();
        expect(actual.counts).toEqual(expected.counts);
        expect(actual.stops).toEqual(expected.stops);
    }, 30000);
    it("hold the indexes of entities they stopped until the worker finalizes them, which it never does once it's ended: they're reused, its stops reported", async () => {
        const fixture = await load();
        expect(await fixture.diesHolding()).toEqual({
            held: 3, whileHeld: 0,
            failures: [["thread", "remoteFinalizersTest/release", 'Thread "remoteFinalizersTest" is gone, so 3 stops of finalizer "remoteFinalizersTest/release" didn\'t run there.']],
            after: 3,
        });
    }, 30000);
    it("read the strings their stops held, which the stop lists copy, after the world freed and reused their records", async () => {
        const fixture = await load();
        expect(await fixture.titledStops()).toEqual(Array.from({ length: 50 }, (_, k) => ({ serial: k, title: `t${k}` })));
    }, 30000);
    it("read a string resource as it was before their stops' sync point applied, after the world wrote it again and freed its record", async () => {
        const fixture = await load();
        expect(await fixture.headedStops()).toEqual(Array.from({ length: 20 }, (_, k) => ({ serial: k, heading: k < 10 ? "h0" : "h6" })));
    }, 30000);
});
