import { describe, expect, it } from "vitest";
import type * as Fixture from "./tails.fixture.js";

/** Tails on a joined worker: the cases, over the fixture built for node or from source. */
export const tailsCases = (load: () => Promise<typeof Fixture>) => describe("tails on a joined worker", () => {
    it("see one tick's values in every run while the world ticks on: in place, from a snapshot when late, and both across a switch at a chunk", async () => {
        const fixture = await load();
        const seen = await fixture.continuous();
        expect({ wrong: seen.wrong, labels: seen.labels, fewest: seen.fewest, most: seen.most }).toEqual({ wrong: 0, labels: 0, fewest: 1000, most: 1000 });
        expect(seen.late).toBeGreaterThan(0);
        expect(seen.switched).toBeGreaterThan(0);
    }, 30000);
    it("see one tick's values in every run, never from a snapshot, when writers wait for them instead", async () => {
        const fixture = await load();
        const seen = await fixture.waiting();
        expect({ wrong: seen.wrong, labels: seen.labels, fewest: seen.fewest, most: seen.most, late: seen.late, switched: seen.switched }).toEqual({ wrong: 0, labels: 0, fewest: 1000, most: 1000, late: 0, switched: 0 });
    }, 30000);
    it("never snapshot when prompt", async () => {
        const fixture = await load();
        const seen = await fixture.prompt();
        expect({ runs: seen.runs, wrong: seen.wrong, labels: seen.labels, late: seen.late, switched: seen.switched }).toEqual({ runs: 30, wrong: 0, labels: 0, late: 0, switched: 0 });
    }, 30000);
    it("read a snapshot taken before a sync point grows what they read, what they write from it stamped as changed", async () => {
        const fixture = await load();
        const seen = await fixture.growing();
        expect({ wrong: seen.wrong, labels: seen.labels, fewest: seen.fewest, most: seen.most, uncounted: seen.uncounted }).toEqual({ wrong: 0, labels: 0, fewest: 1000, most: 21000, uncounted: 0 });
        expect(seen.late).toBeGreaterThan(0);
        expect(seen.counted).toBeGreaterThan(10);
    }, 30000);
    it("read the strings of their tick when runs after it would free and reuse their records, since those runs wait for them", async () => {
        const fixture = await load();
        const seen = await fixture.spanning();
        expect({ runs: seen.runs, wrong: seen.wrong, fewest: seen.fewest, most: seen.most }).toEqual({ runs: 1, wrong: 0, fewest: 1000, most: 1000 });
    }, 30000);
    it("aren't waited for by a sync point when they read only their thread's objects", async () => {
        const fixture = await load();
        expect(await fixture.heldBody()).toBe(true);
    }, 30000);
    it("are skipped in every run queued when their thread left, and nothing waits for a tail on a thread that's gone", async () => {
        const fixture = await load();
        const skipped = ["tailsTest/lead", "tailsTest/watch"];
        expect(await fixture.leaveQueued()).toEqual({ skipped: [skipped, skipped], after: 0 });
    }, 30000);
});
