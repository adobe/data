import { describe, expect, it } from "vitest";
import type * as Fixture from "./joining.fixture.js";

const clean = { failures: [], skipped: [], dropped: 0, warnings: [] };

/** Threads joining worlds on others: the cases, over the fixture built for node or from source. */
export const joiningCases = (load: () => Promise<typeof Fixture>) => describe("joining", () => {
    const expectDriven = (driven: Awaited<ReturnType<typeof Fixture.worldThere>>["driven"] | null, unimported: RegExp) => {
        expect(driven?.reports).toEqual([clean, clean, clean, clean, clean]);
        expect(driven?.failures).toEqual(["joiningTest failure"]);
        expect(driven?.total).toBe(123);
        expect(driven?.selected).toBe(2);
        expect(driven?.counted).toBe(1);
        expect(driven?.listed).toEqual([[2, -2], true]);
        // An entity's whole value is its struct components; its label is an object, on the world's thread.
        expect(driven?.whole).toEqual([2, [1, -1], true, undefined]);
        expect(driven?.unimported).toMatch(unimported);
        expect(driven?.unnamed).toMatch(/has no id, so it can't run from another thread/);
    };

    it("let a worker join a world here: runs land in call order, observers see the world, and its entity shows its progress", async () => {
        const fixture = await load();
        const result = await fixture.worldHere();
        expectDriven(result.driven, /^System ".*joining-worker\.fixture\.ts#unimportedByMain" isn't one this world imported, so it can't run here\.$/);
        expect(result.claims).toEqual(["main"]);
        expect(result.status).toBe("gone");
        expect(result.total).toBe(123);
        expect(result.names).toEqual(["a", "b"]);
    }, 20000);

    it("let this thread join a world on a worker, by the ids of keys and systems both threads imported", async () => {
        const fixture = await load();
        const result = await fixture.worldThere();
        expectDriven(result.driven, /^System ".*joining\.fixture\.ts#unimportedByWorker" isn't one this world imported, so it can't run here\.$/);
        expect(result.total).toBe(123);
        expect(result.names).toEqual(["a", "b"]);
        expect(result.status).toBe("gone");
    }, 20000);

    it("share a world through a worker's own scope, joined through the worker", async () => {
        const fixture = await load();
        expect(await fixture.scopes()).toEqual({ observed: 456, total: 456, status: "gone" });
    }, 20000);

    it("show a joined thread that dies as gone", async () => {
        const fixture = await load();
        expect(await fixture.dies()).toEqual({ ran: "ran", status: "gone" });
    }, 20000);

    it("refuse a thread claimed twice", async () => {
        const fixture = await load();
        expect(await fixture.claimedTwice()).toEqual({ first: "ran", second: 'Thread "main" is claimed twice.', status: "gone" });
    }, 20000);
});
