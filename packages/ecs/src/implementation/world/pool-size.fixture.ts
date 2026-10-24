// © 2026 Adobe. MIT License. See /LICENSE for details.
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { Observe } from "../../observe/index.js";
import { countingWorkers } from "./platforms.test-helper.js";
import { reportOf } from "./reports.test-helper.js";
import type { WorkerPlatform } from "./worker-platform.js";
import type { F32 } from "../../interface/math/index.js";

/** Scenarios of the `workers` resource sizing the pool, run built in node and from source in chromium. */

const value = Symbol("poolSizeTest/value");
declare module "@adobe/ecs" {
    export interface Components {
        [value]: { type: F32 };
    }
}

const other = Symbol("poolSizeTest/other");
declare module "@adobe/ecs" {
    export interface Components {
        [other]: { type: F32 };
    }
}
const others = System.create({}, ({ commands }) => {
    for (let i = 0; i < 4096; i++) commands.spawn([other])({ [other]: i });
});

const seed = System.create({}, ({ commands }) => {
    for (let i = 0; i < 4096; i++) commands.spawn([value])({ [value]: i });
});
const few = System.create({}, ({ commands }) => {
    for (let i = 0; i < 16; i++) commands.spawn([value])({ [value]: i });
});
const double = System.create({ kernel: true, components: { write: [value] } }, row => { row[value] = row[value] * 2; });
const resize = System.create({ resources: { write: [workers] } }, ({ resources }, input: { readonly size: number | null }) => {
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

/**
 * Workers started after a kernel runs over fewer rows than a piece for a worker, then after it runs over enough, and
 * the first values it doubled.
 */
export const whenWarranted = async (): Promise<{ readonly started: readonly number[]; readonly values: readonly (number | null)[] }> => {
    const counting = countingWorkers();
    const world = createWorld({}, { minimumChunk: 64, pool: counting.platform });
    try {
        await world.run(few);
        await world.run(double);
        const started = [counting.started()];
        await world.run(seed);
        await world.run(double);
        started.push(counting.started());
        return { started, values: (await readEach(world, await select(world, { required: [value] }), value)).slice(0, 4) };
    }
    finally {
        await world.dispose();
    }
};

/** The platform's workers, failing every kernel load: each kernel's module is one that throws. */
const failingLoads = (): { readonly platform: WorkerPlatform; readonly loads: () => number } => {
    const counting = countingWorkers();
    const broken = "data:text/javascript,throw new Error('no kernel here')";
    const start = () => {
        const port = counting.platform.start();
        if (port === null) return null;
        return { ...port, post: ((message, transfer) => port.post(message.kind === "kernels" ? { ...message, kernels: message.kernels.map(kernel => ({ ...kernel, url: broken })) } : message, transfer)) satisfies typeof port.post };
    };
    return { platform: { count: counting.platform.count, start }, loads: () => counting.posted("kernels") };
};

/**
 * A kernel whose load fails on workers when the pool starts: the failures of that run's report and of the next, the
 * kernel loads posted after each, and the values its runs doubled, here.
 */
export const failedLoad = async (): Promise<{ readonly failures: readonly (readonly string[])[]; readonly loads: readonly number[]; readonly values: readonly (number | null)[] }> => {
    const failing = failingLoads();
    const world = createWorld({ [workers]: 2 }, { minimumChunk: 64, pool: failing.platform });
    try {
        // Registered while no archetype warrants workers, so the pool starts in a later run.
        await world.run(double);
        await world.run(seed);
        const failures: string[][] = [];
        const loads: number[] = [];
        for (let i = 0; i < 2; i++) {
            const run = await world.run(double);
            failures.push((await reportOf(world, run)).failures.map(failure => `${failure.kind}: ${failure.message}`));
            loads.push(failing.loads());
        }
        return { failures, loads, values: (await readEach(world, await select(world, { required: [value] }), value)).slice(0, 4) };
    }
    finally {
        await world.dispose();
    }
};

/** Workers started after a kernel runs over few rows in a world whose largest archetype no kernel matches. */
export const unmatched = async (): Promise<number> => {
    const counting = countingWorkers();
    const world = createWorld({}, { minimumChunk: 64, pool: counting.platform });
    try {
        await world.run(others);
        await world.run(few);
        await world.run(double);
        await world.run(double);
        return counting.started();
    }
    finally {
        await world.dispose();
    }
};
