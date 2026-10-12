import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Resource } from "../../resource/resource.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

const weight = "reductionsBrowserTest/weight";
const sized = "reductionsBrowserTest/sized";
const count = "reductionsBrowserTest/count";
const sum = "reductionsBrowserTest/sum";
const largest = "reductionsBrowserTest/largest";

declare module "../../component/types.js" {
    export interface Types {
        [weight]: number;
        [sized]: true;
    }
}
declare module "../../resource/types.js" {
    export interface Types {
        [count]: number;
        [sum]: number;
        [largest]: number;
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "reductionsBrowserTest/spawn": true;
        "reductionsBrowserTest/reduce": true;
    }
}

Component.register(weight, { type: "number", precision: 1 });
Component.register(sized, { const: true });
Resource.register(count, { type: "number", default: 0 });
Resource.register(sum, { type: "number", default: 0 });
Resource.register(largest, { type: "number", default: 0 });

const rows = 100_000;
const weightAt = (i: number): number => Math.fround(Math.sin(i * 0.37) * 1000);

const spawn = System.create({ name: "reductionsBrowserTest/spawn" }, (_, __, commands) => {
    for (let i = 0; i < rows; i++) {
        if (i % 4 === 0) commands.spawn({ [weight]: weightAt(i), [sized]: true });
        else commands.spawn({ [weight]: weightAt(i) });
    }
});

const reduce = System.create({ name: "reductionsBrowserTest/reduce", kernel: "cpu", query: { read: [weight] }, resources: { reduce: { [count]: "+", [sum]: "+", [largest]: "max" } } }, (row, context) => {
    context[count](1);
    context[sum](row[weight]);
    context[largest](row[weight]);
});

describe("reductions across workers", () => {
    for (const wasm of [true, false]) {
        it(`fold every row exactly once, in the same order each run (${wasm ? "WASM" : "JS"})`, async () => {
            const world = createWorld({ workers: 4, minimumChunk: 64, wasm });
            await world.systems.register(spawn, reduce);
            await world.run(spawn);
            const sums: number[] = [];
            for (let run = 0; run < 4; run++) {
                await world.run(reduce);
                expect(world.read.resource(count)).toBe(rows);
                expect(world.read.resource(largest)).toBe(Math.max(...Array.from({ length: rows }, (_, i) => weightAt(i))));
                sums.push(world.read.resource(sum) ?? NaN);
            }
            // Each piece folds into its own partial, combined in piece order, so float sums repeat bit for bit.
            expect(new Set(sums).size).toBe(1);
            const direct = Array.from({ length: rows }, (_, i) => weightAt(i)).reduce((total, value) => total + value, 0);
            expect(Math.abs((sums[0] ?? NaN) - direct)).toBeLessThan(1e-6 * rows);
            await world.dispose();
        });
    }
});
