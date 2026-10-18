import { describe, expect, it } from "vitest";
import type * as Fixture from "./thread-systems.fixture.js";

/** Systems on a joined worker: the cases, over the fixture built for node or from source. */
export const threadSystemsCases = (load: () => Promise<typeof Fixture>) => describe("systems on a joined worker", () => {
    it("give an inline world's results: rows, commands, spawns, reductions, resources, lookups, filters, conditions and failures", async () => {
        const fixture = await load();
        const { expected, actual } = await fixture.sameResults();
        expect(actual.snapshots).toEqual(expected.snapshots);
        expect(actual.reports).toEqual(expected.reports);
        expect(actual.warnings[1].length).toBe(7);
    }, 30000);
    it("are skipped with a \"thread\" failure when the worker dies mid-task, and run on the world's thread once it's gone", async () => {
        const fixture = await load();
        expect(await fixture.diesMidTask()).toEqual({
            report: { failures: [["thread", "threadSystemsTest/stall", 'Thread "threadSystemsTest" is gone, so its systems don\'t run.']], skipped: ["threadSystemsTest/stall"] },
            after: 0,
        });
    }, 30000);
    it("can't join claiming the thread of a system the joined thread never imported", async () => {
        const fixture = await load();
        expect(await fixture.unimported()).toBe('System "threadSystemsTest/onlyHere" runs on thread "threadSystemsTest", which the joined thread claiming it never imported.');
    }, 30000);
    it("don't stall ticks that don't touch their thread when it never yields", async () => {
        const fixture = await load();
        expect(await fixture.neverYields(200)).toBeGreaterThanOrEqual(200);
    }, 30000);
    it("let the joined worker return to its event loop while the world ticks back to back", async () => {
        const fixture = await load();
        const { runs } = await fixture.timerWhileTicking();
        // It returns once a tick, each tick a task here, so a timer due waits a few at most, as the event loop's task
        // queues take turns; without returning, hundreds.
        expect(runs).not.toBeNull();
        expect(runs).toBeLessThanOrEqual(10);
    }, 30000);
    it("keep waking the joined worker for tasks that follow each other closely", async () => {
        const fixture = await load();
        // Ticks that stopped for 5 s give -1; ones going on slowly, as on a busy machine, are waited for.
        expect(await fixture.ticksThere(30000)).toBeGreaterThanOrEqual(30000);
    }, 120000);
});
