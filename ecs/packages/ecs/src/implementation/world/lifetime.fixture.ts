// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld, type Tables } from "./create.js";
import { collector, freshKernel, tablesAfterCollecting } from "./lifetime.test-helper.js";
import { readResource } from "./reads.test-helper.js";
import { runRan, type Ran } from "./outcomes.test-helper.js";
import type { F32 } from "../../interface/math/index.js";

/** Scenarios of what kernels hold across the pool, run built in node and from source in chromium. */

const value = Symbol("lifetimeFixture/value");
const target = Symbol("lifetimeFixture/target");
const out = Symbol("lifetimeFixture/out");
const total = Symbol("lifetimeFixture/total");

declare module "@adobe/ecs" {
    export interface Components {
        [value]: { type: F32 };
        [target]: { type: Entity };
        [out]: { type: F32 };
    }
    export interface Resources {
        [total]: { type: number; reduce: "+" };
    }
}


export const rows = 4_096;

const seed = System.create({}, ({ commands }) => {
    let previous = commands.spawn([value])({ [value]: 0 });
    for (let i = 1; i < rows; i++) previous = commands.spawn([value, target, out])({ [value]: i, [target]: previous, [out]: 0 });
});

/** A kernel that holds what kernels can: a lookup's directory, reduction partials and its load on each worker. */
const measure = System.create({
    kernel: true,
    components: { with: [value, target, out] },
    lookup: { targets: { with: [value] } },
}, (row, { lookup: { targets }, reduce }) => {
    const other = targets(row[target]);
    row[out] = other === null ? -1 : row[value] - other[value];
    reduce[total](1);
});

/**
 * Runs `count` new values of a kernel, as a module evaluated again makes, each once, on two workers: the world's tables
 * before and after, once collected where a collector is exposed; whether one was; and the last run's total.
 */
export const freshKernels = async (count: number): Promise<{ readonly before: Tables; readonly after: Tables; readonly collected: boolean; readonly total: number; readonly ran: Ran }> => {
    const world = createWorld({ [workers]: 2 }, { minimumChunk: 64 });
    try {
        await world.run(seed);
        await world.run(measure);
        await world.run(freshKernel(measure));
        await world.run(measure);
        const before = await tablesAfterCollecting(world);
        for (let k = 0; k < count; k++) await world.run(freshKernel(measure));
        const ran = await runRan(world, measure);
        const after = await tablesAfterCollecting(world);
        return { before, after, collected: collector() !== null, total: await readResource(world, total), ran };
    }
    finally {
        await world.dispose();
    }
};
