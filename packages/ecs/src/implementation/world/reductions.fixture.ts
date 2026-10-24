// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "../../interface/system/system.js";
import { readResource } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";
import type { F32 } from "../../interface/math/index.js";

/** Scenarios of reductions across workers, run built in node and from source in chromium. */

const weight = Symbol("reductionsBrowserTest/weight");
const sized = Symbol("reductionsBrowserTest/sized");
const count = Symbol("reductionsBrowserTest/count");
const sum = Symbol("reductionsBrowserTest/sum");
const largest = Symbol("reductionsBrowserTest/largest");

declare module "@adobe/ecs" {
    export interface Components {
        [weight]: { type: F32 };
        [sized]: { type: true };
    }
    export interface Resources {
        [count]: { type: number; reduce: "+" };
        [sum]: { type: number; reduce: "+" };
        [largest]: { type: number; reduce: "max" };
    }
}


export const rows = 100_000;
export const weightAt = (i: number): number => Math.fround(Math.sin(i * 0.37) * 1000);

const spawn = System.create({}, ({ commands }) => {
    for (let i = 0; i < rows; i++) {
        if (i % 4 === 0) commands.spawn([weight, sized])({ [weight]: weightAt(i), [sized]: true });
        else commands.spawn([weight])({ [weight]: weightAt(i) });
    }
});

const reduce = System.create({ kernel: true, components: { read: [weight] }, resources: { reduce: [count, sum, largest] } }, (row, { reduce }) => {
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
