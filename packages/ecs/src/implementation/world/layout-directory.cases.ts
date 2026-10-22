// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./layout-directory.fixture.js";

/** Workers find layouts in the directory, with no message once it changes: the cases, over the fixture built or from source. */
export const layoutDirectoryCases = (load: () => Promise<typeof Fixture>) => describe("the layout directory", () => {
    for (const wasm of [true, false]) {
        it(`lets workers' ${wasm ? "WASM" : "JS"} kernels see every row of 100 archetypes grown across sync points, with no layout message after the one creating them`, async () => {
            const fixture = await load();
            const { messages, totals } = await fixture.grown(wasm);
            expect(messages).toBe(0);
            // Each entity was bumped once per round from the one it spawned in.
            const rounds = fixture.rounds.length;
            const expected = 100 * (rounds + 1) + fixture.rounds.reduce((sum, count, r) => sum + 100 * count * (rounds - r), 0);
            expect(totals).toEqual({ sum: expected, count: 100 * (1 + fixture.rounds.reduce((a, b) => a + b, 0)) });
        });
    }

    it("lets workers' lookups and spawns use the entity table once it grows between runs, with no message", async () => {
        const fixture = await load();
        const { messages, seen, children, values } = await fixture.tableGrown();
        expect(new Set(seen)).toEqual(new Set(Array.from({ length: 64 }, (_, i) => 9_999 - i)));
        expect(messages).toBe(0);
        expect(children).toBe(128);
        expect(values.filter(each => each === -1)).toHaveLength(64);
        expect(values.filter(each => each !== null && each >= 9_936)).toHaveLength(64);
    });

    for (const wasm of [true, false]) {
        it(`lets workers' ${wasm ? "WASM" : "JS"} kernels rebuild their views once memory grows between runs`, async () => {
            const fixture = await load();
            const { grows, messages, totals } = await fixture.memoryGrown(wasm);
            expect(grows).toBeGreaterThan(0);
            expect(messages).toBe(0);
            expect(totals).toEqual({ sum: 100 * 2 + 100 * 2_000, count: 100 * 2_001 });
        });
    }
});
