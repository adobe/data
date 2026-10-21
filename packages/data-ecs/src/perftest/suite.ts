import { Archetype } from "../interface/archetype/archetype.js";
import { Component } from "../interface/component/component.js";
import { Resource } from "../interface/resource/resource.js";
import { Entity } from "../interface/entity/entity.js";
import type { Schema } from "../interface/schema/schema.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";

// One fixture per optimization area: structural changes, change filters, lookups, commands, dispatch and main-thread
// paths.

type Vec3 = readonly [number, number, number];
const vec3 = { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } as const satisfies Schema;

export const position = Symbol("suite/position");
export const velocity = Symbol("suite/velocity");
export const target = Symbol("suite/target");
export const index = Symbol("suite/index");
export const tag = Symbol("suite/tag");
export const unused = Symbol("suite/unused");
export const hits = Symbol("suite/hits");

declare module "@adobe/data-ecs" {
    export interface Components {
        [position]: { type: readonly [number, number, number] };
        [velocity]: { type: readonly [number, number, number] };
        [target]: { type: Entity };
        [index]: { type: number };
        [tag]: { type: true };
        [unused]: { type: true };
        [hits]: { type: number };
    }
}

export const indexSum = Symbol("suite/indexSum");
export const highest = Symbol("suite/highest");
declare module "@adobe/data-ecs" {
    export interface Resources {
        [indexSum]: { type: number; reduce: "+" };
        [highest]: { type: number; reduce: "max" };
    }
}
Resource.register(indexSum, { type: { type: "number", default: 0 }, reduce: "+" });
Resource.register(highest, { type: { type: "number", default: 0 }, reduce: "max" });

Component.register(position, { type: vec3 });
Component.register(velocity, { type: vec3 });
Component.register(target, { type: Entity.schema });
Component.register(index, { type: { type: "integer", minimum: 0, maximum: 0xFFFFFFFF } });
Component.register(tag, { type: { const: true } });
Component.register(unused, { type: { const: true } });
Component.register(hits, { type: { type: "number", precision: 1 } });

const moving = Archetype.create([position, velocity, index]);
const following = Archetype.create([position, velocity, index, target]);

/** `count` entities, each targeting the one spawned before it. */
export const seed = System.create({ name: "suite/seed", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    let previous = commands.spawn(moving)({ [position]: [0, 0, 0], [velocity]: [0, 0, 0], [index]: 0 });
    for (let i = 1; i < input.count; i++) {
        previous = commands.spawn(following)({ [position]: [i, i * 0.5, -i], [velocity]: [1, 0, 0], [index]: i, [target]: previous });
    }
});

/** Despawns a tenth of the entities and spawns as many replacements. */
export const churn = System.create({ name: "suite/churn", input: { type: "object", properties: { group: { type: "integer" } } }, components: { read: [index, position] } }, (row, { input, commands }) => {
    if (row[index] % 10 !== input.group) return;
    commands.despawn(row.entity);
    commands.spawn(moving)({ [position]: row[position], [velocity]: [0, 0, 0], [index]: row[index] });
});

/** Adds the tag to one tenth and removes it from another: a fifth of the entities move archetype. */
export const retag = System.create({ name: "suite/retag", input: { type: "object", properties: { group: { type: "integer" } } }, components: { read: [index] } }, (row, { input, commands }) => {
    const group = row[index] % 10;
    if (group === input.group) commands.add(row.entity, tag);
    else if (group === (input.group + 5) % 10) commands.remove(row.entity, tag);
});

/** Writes 1% of positions. */
export const poke = System.create({
    name: "suite/poke",
    kernel: "cpu",
    input: { type: "object", properties: { group: { type: "integer" } } },
    components: { read: [index], write: [position] },
}, (row, { input }) => {
    if (row[index] % 100 === input.group) {
        const [x, y, z] = row[position];
        row[position] = [x + 1, y, z];
    }
});

/** Writes 1% of positions, clustered in one contiguous run of rows. */
export const pokeCluster = System.create({
    name: "suite/pokeCluster",
    kernel: "cpu",
    input: { type: "object", properties: { group: { type: "integer" } } },
    components: { read: [index], write: [position] },
}, (row, { input }) => {
    const group = row[index] - input.group * 10_000;
    if (group >= 0 && group < 10_000) {
        const [x, y, z] = row[position];
        row[position] = [x + 1, y, z];
    }
});

/** Sees only what changed since it last ran. */
export const observe = System.create({
    name: "suite/observe",
    kernel: "cpu",
    components: { read: [position], write: [velocity], changed: [position] },
}, row => {
    const [x, y, z] = row[position];
    row[velocity] = [x * 0.5, y * 0.5, z * 0.5];
});

/** Steers toward the target: one lookup per row. */
export const follow = System.create({
    name: "suite/follow",
    kernel: "cpu",
    components: { read: [position, target], write: [velocity] },
    lookup: { targets: { read: [position] } },
}, (row, { lookup: { targets } }) => {
    const other = targets(row[target]);
    if (other !== null) {
        const [tx, ty, tz] = other[position];
        const [x, y, z] = row[position];
        row[velocity] = [tx - x, ty - y, tz - z];
    }
});

/** Issues commands from a kernel: a tenth of the rows record a hit. */
export const emit = System.create({
    name: "suite/emit",
    kernel: "cpu",
    components: { read: [index, position] },
}, (row, { commands }) => {
    if (row[index] % 10 === 0) {
        const [x] = row[position];
        commands.add(row.entity, hits, x);
    }
});

/** Six dependent kernels: one tier each, so dispatch cost shows. */
export const chain1 = System.create({ name: "suite/chain1", kernel: "cpu", components: { write: [velocity] } }, row => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x * 0.99, y * 0.99, z * 0.99];
});
export const chain2 = System.create({ name: "suite/chain2", kernel: "cpu", components: { write: [velocity] }, after: [chain1] }, row => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x * 0.99, y * 0.99, z * 0.99];
});
export const chain3 = System.create({ name: "suite/chain3", kernel: "cpu", components: { write: [velocity] }, after: [chain2] }, row => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x * 0.99, y * 0.99, z * 0.99];
});
export const chain4 = System.create({ name: "suite/chain4", kernel: "cpu", components: { write: [velocity] }, after: [chain3] }, row => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x * 0.99, y * 0.99, z * 0.99];
});
export const chain5 = System.create({ name: "suite/chain5", kernel: "cpu", components: { write: [velocity] }, after: [chain4] }, row => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x * 0.99, y * 0.99, z * 0.99];
});
export const chain6 = System.create({ name: "suite/chain6", kernel: "cpu", components: { write: [velocity] }, after: [chain5] }, row => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x * 0.99, y * 0.99, z * 0.99];
});
export const chain = System.create({ name: "suite/chain", systems: [chain1, chain2, chain3, chain4, chain5, chain6] });

/** Fifty small main-thread systems in one tier, each reading every row. */
let total = 0;
export const smalls = System.create({
    name: "suite/smalls",
    systems: Array.from({ length: 50 }, (_, i) => System.create({ name: `suite/small${i}`, components: { read: [position] } }, row => {
        total += row[position][0];
    })),
});
export const totalOf = (): number => total;

/** Fastest of repeated runs within a time budget, like the adobe/data harness. */
export const fastest = async (run: () => Promise<unknown>, budget = 1000, warmup = 10): Promise<number> => {
    for (let warm = 0; warm < warmup; warm++) await run();
    let minimum = Infinity;
    const end = performance.now() + budget;
    while (performance.now() < end) {
        const start = performance.now();
        await run();
        minimum = Math.min(minimum, performance.now() - start);
    }
    return minimum;
};

/** One line per benchmark, so runs can be compared with grep. */
export const report = (name: string, milliseconds: number): void => {
    console.log(`bench ${name}: ${milliseconds.toFixed(3)} ms`);
};

/** A world seeded with `count` entities. Systems register on their first run, which `fastest` leaves out. */
export const seeded = async (create: () => World, count: number): Promise<World> => {
    const world = create();
    await world.run(seed, { count });
    return world;
};

/** Folds every row's index into a sum and a maximum. */
export const reduce = System.create({ name: "suite/reduce", kernel: "cpu", components: { read: [index] }, reduce: { [indexSum]: "+", [highest]: "max" } }, (row, { reduce }) => {
    reduce[indexSum](row[index]);
    reduce[highest](row[index]);
});

/** A system no entity matches: what a run costs with nothing to do. */
export const idle = System.create({ name: "suite/idle", components: { has: [unused] } }, () => {});
/** A system that throws, so each run of it has a report to spawn. */
export const failing = System.create({ name: "suite/failing" }, () => { throw new Error("suite: failing"); });
/** An observer system no entity matches: a run of it alone has no tiers. */
export const idleObserver = System.create({ name: "suite/idleObserver", observer: true, components: { has: [unused] } }, () => {});

/** Fifty systems no entity matches, in one tier. */
export const idles = System.create({
    name: "suite/idles",
    systems: Array.from({ length: 50 }, (_, i) => System.create({ name: `suite/idle${i}`, components: { has: [unused] } }, () => {})),
});

/** Spawns one entity: a run with a sync point that applies one command. */
export const spawnOne = System.create({ name: "suite/spawnOne" }, ({ commands }) => {
    commands.spawn(moving)({ [position]: [0, 0, 0], [velocity]: [0, 0, 0], [index]: 0 });
});

/** One main-thread system reading every row. */
export const small = System.create({ name: "suite/small", components: { read: [position] } }, row => {
    total += row[position][0];
});
