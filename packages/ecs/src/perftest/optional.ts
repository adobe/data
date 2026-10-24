// © 2026 Adobe. MIT License. See /LICENSE for details.
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";
import { createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";
import { fastest } from "./suite.js";

// A main-thread system with an optional component against the same system requiring it, over rows that all have it,
// and over rows of which half lack it: optional components bind per archetype, so a row costs what a member's does.

const height = Symbol("optional/height");
const lift = Symbol("optional/lift");
declare module "@adobe/ecs" {
    export interface Components {
        [height]: { type: number };
        [lift]: { type: number };
    }
}

const rows = 100_000;

const seed = System.create({}, ({ commands }, input: { readonly lacking: boolean }) => {
    for (let i = 0; i < rows; i++) {
        if (input.lacking && i % 2 === 1) commands.spawn([height])({ [height]: 0 });
        else commands.spawn([height, lift])({ [height]: 0, [lift]: 1 });
    }
});

/** Raises each row by its lift, which every row has. */
const raiseRequired = System.create({ kernel: false, components: { with: [height, lift] } }, row => {
    row[height] += row[lift];
});

/** Raises each row by its lift where it has one. */
const raiseOptional = System.create({ kernel: false, components: { with: [height], optional: [lift] } }, row => {
    const by = row[lift];
    if (by !== undefined) row[height] += by;
});

/** As `raiseRequired` and `raiseOptional`, compiled to kernels. */
const raiseRequiredKernel = System.create({ kernel: true, components: { with: [height, lift] } }, row => {
    row[height] += row[lift];
});
const raiseOptionalKernel = System.create({ kernel: true, components: { with: [height], optional: [lift] } }, row => {
    const by = row[lift];
    if (by !== undefined) row[height] += by;
});

const seeded = async (lacking: boolean): Promise<World> => {
    const world = createWorld({ [workers]: 0 });
    await world.run(seed, { lacking });
    return world;
};

const run = async (system: System<void>, lacking: boolean): Promise<number> => {
    const world = await seeded(lacking);
    const best = await fastest(() => world.run(system));
    await world.dispose();
    return best;
};

const per = { per: "rows", n: rows, typical: [1_000, 100_000], best: { bytes: 16, basis: "Each row reads its 8-byte lift and reads and writes its 8-byte height." } } as const;

export const optionalBenchmarks: readonly Benchmark[] = [
    {
        name: "with 100K",
        operation: "A main-thread row system reading a component it requires and writing another, over 100K rows: the baseline for `optional 100K`.",
        ...per,
        run: () => run(raiseRequired, false),
    },
    {
        name: "optional 100K",
        operation: "As `with 100K`, the component it reads optional, over rows that all have it: what reading an optional component costs a row.",
        ...per,
        run: () => run(raiseOptional, false),
    },
    {
        name: "optional half 100K",
        operation: "As `optional 100K`, over rows of which half lack the optional component, in an archetype of their own.",
        ...per,
        run: () => run(raiseOptional, true),
    },
    {
        name: "with 100K kernel",
        operation: "As `with 100K`, compiled to a kernel on the world's thread: the baseline for `optional 100K kernel`.",
        ...per,
        run: () => run(raiseRequiredKernel, false),
    },
    {
        name: "optional 100K kernel",
        operation: "As `optional 100K`, compiled to a kernel: what an optional component costs a kernel's row.",
        ...per,
        run: () => run(raiseOptionalKernel, false),
    },
    {
        name: "optional half 100K kernel",
        operation: "As `optional half 100K`, compiled to a kernel.",
        ...per,
        run: () => run(raiseOptionalKernel, true),
    },
];
