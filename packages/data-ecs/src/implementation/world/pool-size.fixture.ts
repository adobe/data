import { Component } from "../../interface/component/component.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { Observe } from "../../observe/index.js";
import { countingWorkers } from "./platforms.test-helper.js";

/** Scenarios of the `workers` resource sizing the pool, run built in node and from source in chromium. */

const value = Symbol("poolSizeTest/value");
declare module "@adobe/data-ecs" {
    export interface Components {
        [value]: { type: number };
    }
}
Component.register(value, { type: { type: "number", precision: 1 } });

const seed = System.create({ name: "poolSizeTest/seed" }, ({ commands }) => {
    for (let i = 0; i < 4096; i++) commands.spawn([value])({ [value]: i });
});
const double = System.create({ name: "poolSizeTest/double", kernel: "cpu", components: { write: [value] } }, row => { row[value] = row[value] * 2; });
const resize = System.create({ name: "poolSizeTest/resize", input: { type: "object", properties: { size: { anyOf: [{ type: "integer" }, { type: "null" }] } } }, resources: { write: [workers] } }, ({ input, resources }) => {
    resources[workers] = input.size;
});

/** The platform's pool size: a worker per hardware thread but the world's. */
export const platformCount = (): number => countingWorkers().platform.count;

/** With the resource at its default: its value, and the workers started by the first kernel. */
export const byDefault = async (): Promise<{ readonly resource: number | null; readonly started: number }> => {
    const counting = countingWorkers();
    const world = createWorld({}, { minimumChunk: 64, pool: counting.platform });
    try {
        const resource = await Observe.toPromise(Observe.resource(world, workers));
        await world.run(seed);
        await world.run(double);
        return { resource, started: counting.started() };
    }
    finally {
        await world.dispose();
    }
};

/**
 * Starting at `initial`, then set to each of `sizes` with a kernel run after each: workers started so far after each
 * step, and the values the kernels doubled.
 */
export const resized = async (initial: number, sizes: readonly (number | null)[]): Promise<{ readonly started: readonly number[]; readonly values: readonly (number | null)[] }> => {
    const counting = countingWorkers();
    const world = createWorld({ [workers]: initial }, { minimumChunk: 64, pool: counting.platform });
    try {
        await world.run(seed);
        await world.run(double);
        const started = [counting.started()];
        for (const size of sizes) {
            await world.run(resize, { size });
            await world.run(double);
            started.push(counting.started());
        }
        return { started, values: await readEach(world, await select(world, { required: [value] }), value) };
    }
    finally {
        await world.dispose();
    }
};
