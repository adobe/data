// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./ports.fixture.js";

/** Workers that die, are lent, or serve a world on a worker: the cases, over the fixture built for node or from source. */
export const portsCases = (load: () => Promise<typeof Fixture>) => describe("thread ports", () => {
    // A browser `Worker` ended from outside reports nothing, so there it's killed by the owner that lent it.
    const ways: readonly ("exit" | "owner")[] = typeof Worker === "function" ? ["owner"] : ["exit", "owner"];
    for (const by of ways) for (const wasm of [true, false]) {
        it(`fail the run whose ${wasm ? "WASM" : "JS"} task's worker is killed from outside mid-task, by ${by === "exit" ? "ending it" : "its owner"}, and every later task on it`, async () => {
            const fixture = await load();
            const { first, second, disposed } = await fixture.killedMidTask(by, wasm);
            const death = by === "exit" ? /exited/ : /terminated by its owner/;
            expect(first.length).toBeGreaterThan(0);
            for (const message of first) expect(message).toMatch(death);
            expect(second.length).toBeGreaterThan(0);
            for (const message of second) expect(message).toMatch(death);
            expect(disposed).toBe(true);
        }, 30000);
    }

    it("serve a world on a worker as its nested workers, with the main thread's results", async () => {
        const fixture = await load();
        const alone = await fixture.simulate(0, false);
        const nested = await fixture.nested();
        expect(nested.rows).toEqual(alone.rows);
        expect(nested.tasks).toBeGreaterThanOrEqual(12 * 3);
    }, 30000);

    it("serve a world on a worker as workers the main thread lent it, with the main thread's results", async () => {
        const fixture = await load();
        const alone = await fixture.simulate(0, false);
        const lent = await fixture.lent();
        expect(lent.rows).toEqual(alone.rows);
        expect(lent.tasks).toBeGreaterThanOrEqual(12 * 3);
    }, 30000);
});
