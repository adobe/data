// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./index-workers.fixture.js";

/** Kernels looking up through indexes across workers: the cases, over the fixture built for node or from source. */
export const indexWorkersCases = (load: () => Promise<typeof Fixture>) => describe("index lookups on workers", () => {
    it.each([[true], [false]])("give what the main thread alone gives, WASM %s", async wasm => {
        const fixture = await load();
        const alone = await fixture.simulate(0, wasm);
        const one = await fixture.simulate(1, wasm);
        const three = await fixture.simulate(3, wasm);
        expect(one.rows).toEqual(alone.rows);
        expect(three.rows).toEqual(alone.rows);
        expect(three.tasks).toBeGreaterThan(0);
        // Targets' tallies through the index without a key: its length in millions, then a stride of its weights.
        expect(three.rows.filter(row => /^\[\d+,-?\d+,\d{7,}\]$/.test(row)).length).toBeGreaterThan(900);
    });
    it.each([[true], [false]])("read a hash index's long buckets in entity order after changes left them unsorted, WASM %s", async wasm => {
        const fixture = await load();
        for (const threads of [0, 3]) {
            const orders = await fixture.bandOrders(threads, wasm);
            expect(orders.kernel).toEqual(orders.byHand);
            expect(orders.kernel.every(round => round[0] > 0)).toBe(true);
            if (threads > 0) expect(orders.tasks).toBeGreaterThan(0);
        }
    });
});
