// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "../../interface/entity/entity.js";
import type { Schema } from "../../interface/schema/schema.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld } from "./create.js";
import { countingWorkers } from "./platforms.test-helper.js";
import { read, readEach, select } from "./reads.test-helper.js";
import { runReported } from "./reports.test-helper.js";
import type { U32, Vec4 } from "../../interface/math/index.js";

/** Scenarios of workers' command rings against the main thread alone, run built in node and from source in chromium. */

const vec4 = { type: "array", items: { type: "number", precision: 1 }, minItems: 4, maxItems: 4 } as const satisfies Schema;

const index = Symbol("commandRingsTest/index");
const weight = Symbol("commandRingsTest/weight");
const extent = Symbol("commandRingsTest/extent");
const made = Symbol("commandRingsTest/made");
const doomed = Symbol("commandRingsTest/doomed");
const target = Symbol("commandRingsTest/target");
const name = Symbol("commandRingsTest/name");
const maybe = Symbol("commandRingsTest/maybe");
const tally = Symbol("commandRingsTest/tally");

declare module "@adobe/ecs" {
    export interface Components {
        [index]: { type: U32 };
        [weight]: { type: number };
        [extent]: { type: Vec4 };
        [made]: { type: U32 };
        [doomed]: { type: true };
        [target]: { type: Entity };
        [name]: { type: string | null; default: "unnamed" };
        [maybe]: { type: string | null };
        [tally]: { type: number | null };
    }
}

/** Objects: a nullable string starting at "unnamed", a nullable string, and a nullable number. */

const seed = System.create({ name: "commandRingsTest/seed" }, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) commands.spawn([index])({ [index]: i });
});

/**
 * About 120 bytes of ring per row: two adds to the row, the later winning, a list add of a vec4, a spawn, and a despawn
 * of every seventh spawn's row, so a run of a few thousand rows overflows a worker's ring.
 */
const burst = System.create({
    name: "commandRingsTest/burst",
    kernel: "cpu",
    components: { read: [index] },
}, (row, { commands }, input: { readonly shift: number }) => {
    const i = row[index];
    commands.add(row.entity, weight, -1);
    commands.add(row.entity, weight, i + input.shift);
    commands.add(row.entity, [extent, doomed], { [extent]: [i, i + 1, i + 2, input.shift] });
    const spawned = commands.spawn([made])({ [made]: i });
    if (i % 7 === 0) commands.despawn(spawned);
});

/** Every row's values and spawns, in a canonical order, since entity ids depend on reservation interleaving. */
const burstState = async (world: World): Promise<readonly string[]> => {
    const rows = await Promise.all((await select(world, { required: [index] })).map(entity => Promise.all([
        read(world, entity, index), read(world, entity, weight), read(world, entity, extent), read(world, entity, doomed),
    ])));
    const spawned = await readEach(world, await select(world, { required: [made] }), made);
    return [...rows.map(row => JSON.stringify(row)).sort(), JSON.stringify(spawned.sort((a, b) => Number(a) - Number(b)))];
};

/** Using `world`, then disposing it. */
const using = async <T>(world: World, use: (world: World) => Promise<T>): Promise<T> => {
    try {
        return await use(world);
    }
    finally {
        await world.dispose();
    }
};

/**
 * `burst` over 8,000 rows twice, and the completions that spilled after each: the first run's rings overflow, and the
 * sync point grows them to what the run needed, so the second spills nothing more.
 */
export const overflow = (count: number): Promise<{ readonly rows: readonly string[]; readonly first: number; readonly second: number }> => {
    const counting = countingWorkers();
    return using(createWorld({ [workers]: count }, { minimumChunk: 64, pool: counting.platform }), async world => {
        await world.run(seed, { count: 8_000 });
        await world.run(burst, { shift: 1 });
        const first = counting.spilled();
        await world.run(burst, { shift: 2 });
        return { rows: await burstState(world), first, second: counting.spilled() };
    });
};

/** Rows targeting a live entity, but for the last, whose target never lived. */
const targets = System.create({ name: "commandRingsTest/targets" }, ({ commands }, input: { readonly count: number }) => {
    const first = commands.spawn([index])({ [index]: 0 });
    for (let i = 1; i < input.count; i++) commands.spawn([index, target])({ [index]: i, [target]: i === input.count - 1 ? Entity.none : first });
});

/** A spawn and an add for each row, then a read through its target, which throws at the last row, whose target is none. */
const failing = System.create({
    name: "commandRingsTest/failing",
    kernel: "cpu",
    components: { read: [index, target] },
    lookup: { targets: { read: [index] } },
}, (row, { lookup, commands }) => {
    commands.spawn([made])({ [made]: row[index] });
    commands.add(row.entity, weight, row[index]);
    const other = lookup.targets(row[target]);
    // @ts-expect-error the last row's target is none, so reading through it throws, as a kernel failing partway does
    commands.add(row.entity, extent, [other[index], 0, 0, 0]);
});

type Failed = { readonly failures: readonly string[]; readonly weights: readonly unknown[]; readonly extents: readonly string[]; readonly spawned: readonly unknown[] };

/** The run's failures, then every row's weight and extent, and the spawns, after `failing` throws at its last row. */
export const failed = (count: number): Promise<Failed> => using(createWorld({ [workers]: count }, { minimumChunk: 64 }), async world => {
    await world.run(targets, { count: 1_000 });
    const report = await runReported(world, failing);
    const rows = await select(world, { required: [index] });
    const spawned = await readEach(world, await select(world, { required: [made] }), made);
    return {
        failures: report.failures.map(failure => failure.name),
        weights: (await readEach(world, rows, weight)).sort((a, b) => Number(a) - Number(b)),
        extents: (await readEach(world, rows, extent)).map(value => JSON.stringify(value)).sort(),
        spawned: spawned.sort((a, b) => Number(a) - Number(b)),
    };
});

/** A spawn for every 64th row: each chunk uses one position of its block of eight and returns the rest. */
const sparse = System.create({
    name: "commandRingsTest/sparse",
    kernel: "cpu",
    components: { read: [index], not: [made] },
}, (row, { commands }) => {
    if (row[index] % 64 === 0) commands.spawn([made])({ [made]: row[index] });
});

const many = System.create({ name: "commandRingsTest/many" }, ({ commands }) => {
    for (let i = 0; i < 5_000; i++) commands.spawn([made])({ [made]: 1_000_000 + i });
});

/**
 * Sparse spawns from workers over five runs, then 5,000 from the main thread, which reuse the positions blocks returned:
 * how many entities have `made`, and how many of them are distinct. A position returned twice would be reserved twice.
 */
export const returned = (count: number): Promise<{ readonly spawned: number; readonly distinct: number }> => using(createWorld({ [workers]: count }, { minimumChunk: 64 }), async world => {
    await world.run(seed, { count: 4_096 });
    for (let run = 0; run < 5; run++) await world.run(sparse);
    await world.run(many);
    const entities = await select(world, { required: [made] });
    return { spawned: entities.length, distinct: new Set(entities).size };
});

/** Object components from a kernel: left out, null, and a number, by add and by spawn. */
const objects = System.create({
    name: "commandRingsTest/objects",
    kernel: "cpu",
    components: { read: [index] },
}, (row, { commands }) => {
    const i = row[index];
    commands.add(row.entity, [name, maybe, tally], { [maybe]: null, [tally]: i });
    commands.spawn([made, name, maybe, tally])({ [made]: i, [tally]: null });
});

/** Each row's object components, then each spawn's, in index order. */
export const objectValues = (count: number): Promise<readonly unknown[]> => using(createWorld({ [workers]: count }, { minimumChunk: 64 }), async world => {
    await world.run(seed, { count: 1_000 });
    await world.run(objects);
    const rows = await select(world, { required: [index], order: { [index]: true } });
    const spawned = await select(world, { required: [made], order: { [made]: true } });
    return [
        await readEach(world, rows, name), await readEach(world, rows, maybe), await readEach(world, rows, tally),
        await readEach(world, spawned, name), await readEach(world, spawned, maybe), await readEach(world, spawned, tally),
    ];
});
