// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Resource } from "../../interface/resource/resource.js";
import type { Schema } from "../../interface/schema/schema.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { read, readEach, readResource, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";
import { countingWorkers } from "./platforms.test-helper.js";
import type { WorkerPlatform } from "./worker-platform.js";

/** Scenarios of kernels on workers against the main thread alone, run built in node and from source in chromium. */

type Vec2 = readonly [number, number];
const vec2 = { type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2 } as const satisfies Schema;

const position = Symbol("workersTest/position");
const velocity = Symbol("workersTest/velocity");
const target = Symbol("workersTest/target");
const offset = Symbol("workersTest/offset");
const spawned = Symbol("workersTest/spawned");
const tagA = Symbol("workersTest/tag-a");
const tagB = Symbol("workersTest/tag-b");
const tagC = Symbol("workersTest/tag-c");
const tagD = Symbol("workersTest/tag-d");
const tagE = Symbol("workersTest/tag-e");
const tagF = Symbol("workersTest/tag-f");
const tagG = Symbol("workersTest/tag-g");
const tagH = Symbol("workersTest/tag-h");
const tagI = Symbol("workersTest/tag-i");
const tags = [tagA, tagB, tagC, tagD, tagE, tagF, tagG, tagH, tagI] as const;
const seconds = Symbol("workersTest/seconds");

declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: readonly [number, number] };
        [velocity]: { type: readonly [number, number] };
        [target]: { type: Entity };
        [offset]: { type: number };
        [spawned]: { type: true };
        [tagA]: { type: true };
        [tagB]: { type: true };
        [tagC]: { type: true };
        [tagD]: { type: true };
        [tagE]: { type: true };
        [tagF]: { type: true };
        [tagG]: { type: true };
        [tagH]: { type: true };
        [tagI]: { type: true };
    }
    export interface Resources {
        [seconds]: { type: number };
    }
}

Component.register(position, { type: vec2 });
Component.register(velocity, { type: vec2 });
Component.register(target, { type: Entity.schema });
Component.register(offset, { type: { type: "number", precision: 1 } });
Component.register(spawned, { type: { const: true } });
Component.register(tagA, { type: { const: true } });
Component.register(tagB, { type: { const: true } });
Component.register(tagC, { type: { const: true } });
Component.register(tagD, { type: { const: true } });
Component.register(tagE, { type: { const: true } });
Component.register(tagF, { type: { const: true } });
Component.register(tagG, { type: { const: true } });
Component.register(tagH, { type: { const: true } });
Component.register(tagI, { type: { const: true } });

/** 64 entities in each of the 512 archetypes the tags combine into. */
const scatter = System.create({ name: "workersTest/scatter" }, ({ commands }) => {
    for (let i = 0; i < 512 * 64; i++) {
        const components: (typeof position | typeof velocity | (typeof tags)[number])[] = [position, velocity];
        tags.forEach((tag, bit) => { if (((i >> 6) & (1 << bit)) !== 0) components.push(tag); });
        commands.spawn(components)({ [position]: [i, 0], [velocity]: [1, i % 5] });
    }
});
Resource.register(seconds, { type: { type: "number", default: 0.25 } });

/** Spawns `count` moving entities, each following the one before it. */
const seed = System.create({ name: "workersTest/seed" }, ({ commands }, input: { readonly count: number }) => {
    let previous = commands.spawn([position, velocity])({ [position]: [0, 0], [velocity]: [1, 0] });
    for (let i = 1; i < input.count; i++) {
        previous = commands.spawn([position, velocity, target])({ [position]: [i, 0], [velocity]: [1, i % 7], [target]: previous });
    }
});

const integrate = System.create({
    name: "workersTest/integrate",
    kernel: "cpu",
    components: { read: [velocity], write: [position] },
    resources: { read: [seconds] },
}, (row, { resources }) => {
    const [x, y] = row[position];
    const [vx, vy] = row[velocity];
    row[position] = [x + vx * resources[seconds], y + vy * resources[seconds]];
});

/** Structural commands from workers: rows past a threshold spawn a marker and lose their velocity. */
const split = System.create({
    name: "workersTest/split",
    kernel: "cpu",
    components: { read: [position], has: [velocity] },
    after: [integrate],
}, (row, { commands }) => {
    const [x, y] = row[position];
    if (y > 3) {
        commands.spawn([position, spawned])({ [position]: [x, -y], [spawned]: true });
        commands.remove(row.entity, velocity);
    }
});

/** Lookups from workers: offset by the distance to the target. */
const follow = System.create({
    name: "workersTest/follow",
    kernel: "cpu",
    components: { read: [position, target], write: [offset] },
    lookup: { targets: { read: [position] } },
    after: [split],
}, (row, { lookup: { targets } }) => {
    const other = targets(row[target]);
    const [x] = row[position];
    row[offset] = other === null ? -1 : x - other[position][0];
}, );

const main = System.create({ name: "workersTest/main", systems: [integrate, split, follow] });

/** Every row writes the same entity, so only merge order decides which value survives. */
const stamp = System.create({
    name: "workersTest/stamp",
    kernel: "cpu",
    components: { read: [position] },
}, (row, { commands }, input: { readonly entity: Entity }) => {
    const [x, y] = row[position];
    commands.add(input.entity, offset, x * 1000 + y);
});

/** Despawns entity 1, the resource entity, since index 0 is never an entity and registration reserves the next first. */
const unlink = System.create({
    name: "workersTest/unlink",
    kernel: "cpu",
    components: { has: [target] },
}, (_, { commands }) => {
    // @ts-expect-error an untyped caller can pass any number
    commands.despawn(1);
});

/** Archetypes in this order: 5 rows the main thread runs, 1,000 that workers run, then 10 more on the main thread. */
const sources = System.create({ name: "workersTest/sources" }, ({ commands }) => {
    for (let i = 0; i < 5; i++) commands.spawn([offset, tagD])({ [offset]: i });
    for (let i = 5; i < 1_005; i++) commands.spawn([offset, tagA])({ [offset]: i });
    for (let i = 1_005; i < 1_015; i++) commands.spawn([offset, tagB])({ [offset]: i });
});

/** A spawn per row, from wherever its chunk runs; with `edit`, each spawn is also added to and removed from. */
const emit = System.create({
    name: "workersTest/emit",
    kernel: "cpu",
    components: { read: [offset], not: [spawned] },
}, (row, { commands }, input: { readonly edit: boolean }) => {
    const entity = commands.spawn([position, spawned, tagC])({ [position]: [row[offset], -row[offset]] });
    if (input.edit) {
        commands.add(entity, velocity, [row[offset], 1]);
        commands.remove(entity, tagC);
    }
});

const emitted = { seen: 0 };
const countEmitted = System.create({ name: "workersTest/countEmitted", components: { added: [position], has: [spawned] } }, () => { emitted.seen++; });

const gathered: Entity[] = [];
const gatherPositioned = System.create({ name: "workersTest/gatherPositioned", observer: true, components: { has: [position] } }, row => { gathered.push(row.entity); });
const gatherSpawned = System.create({ name: "workersTest/gatherSpawned", observer: true, components: { has: [spawned] } }, row => { gathered.push(row.entity); });

/** The entities an observer row system passes, in storage order. */
const storageOrder = async (world: World, gather: System<void>): Promise<Entity[]> => {
    gathered.length = 0;
    await world.run(gather);
    return [...gathered];
};

/** Runs `use` with a world, then disposes it. */
const using = async <T>(world: World, use: (world: World) => Promise<T>): Promise<T> => {
    try {
        return await use(world);
    }
    finally {
        await world.dispose();
    }
};

/** Every entity's values, in a canonical order, since entity ids depend on reservation interleaving. */
const snapshot = async (world: World): Promise<string[]> => {
    const rows = await Promise.all((await select(world, { required: [position] })).map(entity => Promise.all([
        read(world, entity, position),
        read(world, entity, velocity),
        read(world, entity, offset),
        read(world, entity, spawned),
    ])));
    return rows.map(row => JSON.stringify(row)).sort();
};

/** 2,000 following entities run through `main` for 12 frames, on the platform's workers or these, and the run tasks posted to workers. */
export const simulate = async (count: number, wasm = true, simd = false, platform?: WorkerPlatform): Promise<{ readonly rows: readonly string[]; readonly tasks: number }> => {
    const counting = countingWorkers(platform);
    return using(createWorld({ [workers]: count }, { minimumChunk: 64, wasm, simd, pool: counting.platform }), async world => {
        await world.run(seed, { count: 2000 });
        for (let frame = 0; frame < 12; frame++) await world.run(main);
        return { rows: await snapshot(world), tasks: counting.posted("run") };
    });
};

/** `integrate` over 512 archetypes, three frames. */
export const scattered = (count: number): Promise<readonly string[]> => using(createWorld({ [workers]: count }, { minimumChunk: 64 }), async world => {
    await world.run(scatter);
    for (let frame = 0; frame < 3; frame++) await world.run(integrate);
    return snapshot(world);
});

/** What survives every row's command to one entity, and every position. */
export const ordered = (count: number): Promise<readonly unknown[]> => using(createWorld({ [workers]: count }, { minimumChunk: 64 }), async world => {
    await world.run(seed, { count: 2000 });
    for (let frame = 0; frame < 4; frame++) await world.run(main);
    const [first] = await storageOrder(world, gatherPositioned);
    await world.run(stamp, { entity: first });
    return [await read(world, first, offset), await readEach(world, await storageOrder(world, gatherPositioned), position)];
});

/** Kernel spawns from 1,015 rows over three archetypes: how many an `added` system saw, and the spawns' values. */
export const spawns = (count: number, edit: boolean): Promise<readonly unknown[]> => using(createWorld({ [workers]: count }, { minimumChunk: 64 }), async world => {
    await world.run(sources);
    await world.run(emit, { edit });
    emitted.seen = 0;
    await world.run(countEmitted);
    await world.run(countEmitted);
    const entities = await storageOrder(world, gatherSpawned);
    return [emitted.seen, await readEach(world, entities, position), await readEach(world, entities, velocity), await readEach(world, entities, tagC)];
});

/** The resource after a worker kernel despawned the resource entity. */
export const unlinked = (): Promise<number> => using(createWorld({ [workers]: 2 }, { minimumChunk: 64 }), async world => {
    await world.run(seed, { count: 500 });
    await world.run(unlink);
    await world.run(integrate);
    return readResource(world, seconds);
});

/** Workers ended by `dispose`, and what a run after it rejects with. */
export const disposed = async (): Promise<{ readonly started: number; readonly terminated: number; readonly after: string }> => {
    const counting = countingWorkers();
    const world = createWorld({ [workers]: 2 }, { pool: counting.platform });
    // Workers start with the first kernel.
    await world.run(main);
    await world.dispose();
    const after = await world.run(main).then(() => "resolved", (error: unknown) => String(error));
    return { started: counting.started(), terminated: counting.terminated(), after };
};
