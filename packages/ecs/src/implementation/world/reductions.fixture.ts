// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from "../../interface/component/component.js";
import { Resource } from "../../interface/resource/resource.js";
import { System } from "../../interface/system/system.js";
import { readResource } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";

/** Scenarios of reductions across workers, run built in node and from source in chromium. */

const weight = Symbol("reductionsBrowserTest/weight");
const sized = Symbol("reductionsBrowserTest/sized");
const count = Symbol("reductionsBrowserTest/count");
const sum = Symbol("reductionsBrowserTest/sum");
const largest = Symbol("reductionsBrowserTest/largest");

declare module "@adobe/ecs" {
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

export const rows = 100_000;
export const weightAt = (i: number): number => Math.fround(Math.sin(i * 0.37) * 1000);

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

/** Four runs of the reduction on four workers: each run's count, largest and sum. */
export const reduced = async (wasm: boolean): Promise<readonly (readonly [number, number, number])[]> => {
    const world = createWorld({ [workers]: 4 }, { minimumChunk: 64, wasm });
    try {
        await world.run(spawn);
        const runs: [number, number, number][] = [];
        for (let run = 0; run < 4; run++) {
            await world.run(reduce);
            runs.push([await readResource(world, count), await readResource(world, largest), await readResource(world, sum)]);
        }
        return runs;
    }
    finally {
        await world.dispose();
    }
};
