import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Resource } from "../../interface/resource/resource.js";
import { System } from "../../interface/system/system.js";
import { readResource } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";

const weight = Symbol("reductionsBrowserTest/weight");
const sized = Symbol("reductionsBrowserTest/sized");
const count = Symbol("reductionsBrowserTest/count");
const sum = Symbol("reductionsBrowserTest/sum");
const largest = Symbol("reductionsBrowserTest/largest");

declare module "@adobe/data-ecs" {
    export interface Components {
        [weight]: { type: number };
        [sized]: { type: true };
    }
    export interface Resources {
        [count]: { type: number; reduce: "+" };
        [sum]: { type: number; reduce: "+" };
        [largest]: { type: number; reduce: "max" };
    }
}

Component.register(weight, { type: { type: "number", precision: 1 } });
Component.register(sized, { type: { const: true } });
Resource.register(count, { type: { type: "number", default: 0 }, reduce: "+" });
Resource.register(sum, { type: { type: "number", default: 0 }, reduce: "+" });
Resource.register(largest, { type: { type: "number", default: 0 }, reduce: "max" });

const rows = 100_000;
const weightAt = (i: number): number => Math.fround(Math.sin(i * 0.37) * 1000);

const spawn = System.create({ name: "reductionsBrowserTest/spawn" }, ({ commands }) => {
    for (let i = 0; i < rows; i++) {
        if (i % 4 === 0) commands.spawn([weight, sized])({ [weight]: weightAt(i), [sized]: true });
        else commands.spawn([weight])({ [weight]: weightAt(i) });
    }
});

const reduce = System.create({ name: "reductionsBrowserTest/reduce", kernel: "cpu", components: { read: [weight] }, reduce: { [count]: "+", [sum]: "+", [largest]: "max" } }, (row, { reduce }) => {
    reduce[count](1);
    reduce[sum](row[weight]);
    reduce[largest](row[weight]);
});

describe("reductions across workers", () => {
    for (const wasm of [true, false]) {
        it(`fold every row exactly once, in the same order each run (${wasm ? "WASM" : "JS"})`, async () => {
            const world = createWorld({ [workers]: 4 }, { minimumChunk: 64, wasm });
            await world.run(spawn);
            const sums: number[] = [];
            for (let run = 0; run < 4; run++) {
                await world.run(reduce);
                expect(await readResource(world, count)).toBe(rows);
                expect(await readResource(world, largest)).toBe(Math.max(...Array.from({ length: rows }, (_, i) => weightAt(i))));
                sums.push(await readResource(world, sum));
            }
            // Each piece folds into its own partial, combined in piece order, so float sums repeat bit for bit.
            expect(new Set(sums).size).toBe(1);
            const direct = Array.from({ length: rows }, (_, i) => weightAt(i)).reduce((total, value) => total + value, 0);
            expect(Math.abs((sums[0] ?? NaN) - direct)).toBeLessThan(1e-6 * rows);
            await world.dispose();
        });
    }
});
