// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./joining.fixture.js";

/** Threads joining worlds on others: the cases, over the fixture built for node or from source. */
export const joiningCases = (load: () => Promise<typeof Fixture>) => describe("joining", () => {
    const expectDriven = (driven: Awaited<ReturnType<typeof Fixture.worldThere>>["driven"] | null, unimported: RegExp) => {
        // Runs resolve to what their bodies returned, posted from the world's thread.
        expect(driven?.runs).toEqual([1, 1, 12, 2, 123]);
        expect(driven?.failed).toMatch(/^System "fail" \(.*joining\.test-helper\.ts#fail\) failed: joiningTest failure$/);
        // Its own observer system runs on the joined thread, resolving to what it read there.
        expect(driven?.read).toBe(123);
        expect(driven?.total).toBe(123);
        expect(driven?.selected).toBe(2);
        expect(driven?.counted).toBe(1);
        expect(driven?.listed).toEqual([[2, -2], true]);
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
    }, 30000);

    it("let this thread join a world on a worker, by the ids of keys and systems both threads imported", async () => {
        const fixture = await load();
        const result = await fixture.worldThere();
        expectDriven(result.driven, /^System ".*joining\.fixture\.ts#unimportedByWorker" isn't one this world imported, so it can't run here\.$/);
        expect(result.total).toBe(123);
        expect(result.names).toEqual(["a", "b"]);
        expect(result.status).toBe("gone");
    }, 30000);

    it("share a world through a worker's own scope, joined through the worker, the observer factories there giving its values", async () => {
        const fixture = await load();
        expect(await fixture.scopes()).toEqual({ observed: 456, total: 456, status: "gone" });
    }, 30000);

    it("show a joined thread that dies as gone", async () => {
        const fixture = await load();
        expect(await fixture.dies()).toEqual({ ran: "ran", share: "joined", status: "gone" });
    }, 30000);

    it("refuse a thread claimed twice, rejecting its share and its join, saying why", async () => {
        const fixture = await load();
        expect(await fixture.claimedTwice()).toEqual({ first: "ran", second: 'Thread "main" is claimed twice.', shared: ["joined", 'Thread "main" is claimed twice.'], status: "gone" });
    }, 30000);

    it("resolve share once a worker joined, so a run from this thread reaches the observer systems it added as it joined", async () => {
        const fixture = await load();
        const result = await fixture.signal();
        expect(result.share).toBe("joined");
        expect(result.joined).toBe("joined");
        expect(result.heard).toContain(7);
    }, 30000);

    it("reject share for a worker that dies before its join finished, releasing its claims", async () => {
        const fixture = await load();
        expect(await fixture.diesJoining()).toEqual({ share: "The thread was gone before it joined.", again: "joined" });
    }, 30000);

    it("reject a run of an observer system the thread claiming its objects never imported, and go on", async () => {
        const fixture = await load();
        expect(await fixture.unimportedObserver()).toEqual({
            ran: expect.stringMatching(/^System "shelvedHere" runs on thread "main", which the joined thread claiming it never imported\.$/),
            after: "joined", disposed: "joined",
        });
    }, 60000);

    it("reject a share with a worker, and a join through one, that fails as it starts, saying why", async () => {
        const fixture = await load();
        expect(await fixture.failingWorkers()).toEqual({
            shared: expect.stringMatching(/^The thread failed before it joined: .*failing worker$/),
            joined: expect.stringMatching(/^The world's thread failed before it answered: .*failing worker$/),
        });
    }, 60000);

    it("reject a join whose world's thread dies before answering", async () => {
        const fixture = await load();
        expect(await fixture.worldDies()).toBe("The world's thread is gone.");
    }, 30000);
});
