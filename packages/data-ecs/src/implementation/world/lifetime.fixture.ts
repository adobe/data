import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Resource } from "../../interface/resource/resource.js";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld, type Tables } from "./create.js";
import { collector, freshKernel, tablesAfterCollecting } from "./lifetime.test-helper.js";
import { readResource } from "./reads.test-helper.js";

/** Scenarios of what kernels hold across the pool, run built in node and from source in chromium. */

const value = Symbol("lifetimeFixture/value");
const target = Symbol("lifetimeFixture/target");
const out = Symbol("lifetimeFixture/out");
const total = Symbol("lifetimeFixture/total");

declare module "@adobe/data-ecs" {
    export interface Components {
        [value]: { type: number };
        [target]: { type: Entity };
        [out]: { type: number };
    }
    export interface Resources {
        [total]: { type: number; reduce: "+" };
    }
}

Component.register(value, { type: { type: "number", precision: 1 } });
Component.register(target, { type: Entity.schema });
Component.register(out, { type: { type: "number", precision: 1 } });
Resource.register(total, { type: { type: "number", default: 0 }, reduce: "+" });

export const rows = 4_096;

const seed = System.create({ name: "lifetimeFixture/seed" }, ({ commands }) => {
    let previous = commands.spawn([value])({ [value]: 0 });
    for (let i = 1; i < rows; i++) previous = commands.spawn([value, target, out])({ [value]: i, [target]: previous, [out]: 0 });
});

/** A kernel that holds what kernels can: a lookup's directory, reduction partials and its load on each worker. */
const measure = System.create({
    name: "lifetimeFixture/measure",
    kernel: "cpu",
    components: { read: [value, target], write: [out] },
    lookup: { targets: { read: [value] } },
    reduce: { [total]: "+" },
}, (row, { lookup: { targets }, reduce }) => {
    const other = targets(row[target]);
    row[out] = other === null ? -1 : row[value] - other[value];
    reduce[total](1);
});

/**
 * Runs `count` new values of a kernel, as a module evaluated again makes, each once, on two workers: the world's tables
 * before and after, once collected where a collector is exposed; whether one was; and the last run's total.
 */
export const freshKernels = async (count: number): Promise<{ readonly before: Tables; readonly after: Tables; readonly collected: boolean; readonly total: number }> => {
    const world = createWorld({ [workers]: 2 }, { minimumChunk: 64 });
    try {
        await world.run(seed);
        await world.run(measure);
        await world.run(freshKernel(measure));
        await world.run(measure);
        const before = await tablesAfterCollecting(world);
        for (let k = 0; k < count; k++) await world.run(freshKernel(measure));
        await world.run(measure);
        const after = await tablesAfterCollecting(world);
        return { before, after, collected: collector() !== null, total: await readResource(world, total) };
    }
    finally {
        await world.dispose();
    }
};
