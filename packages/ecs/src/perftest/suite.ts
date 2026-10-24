// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Archetype } from "../interface/archetype/archetype.js";
import { Entity } from "../interface/entity/entity.js";
import type { I32 } from "../interface/math/i32/index.js";
import type { Schema } from "../interface/schema/schema.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";
import type { F32, U32 } from "../interface/math/index.js";

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

declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: Schema.Type<{ type: "array"; items: { type: "number"; precision: 1 }; minItems: 3; maxItems: 3 }> };
        [velocity]: { type: Schema.Type<{ type: "array"; items: { type: "number"; precision: 1 }; minItems: 3; maxItems: 3 }> };
        [target]: { type: Entity };
        [index]: { type: U32 };
        [tag]: { type: true };
        [unused]: { type: true };
        [hits]: { type: F32 };
    }
}

export const indexSum = Symbol("suite/indexSum");
export const highest = Symbol("suite/highest");
declare module "@adobe/ecs" {
    export interface Resources {
        [indexSum]: { type: number; reduce: "+"; default: 0 };
        [highest]: { type: number; reduce: "max"; default: 0 };
    }
}


const moving = Archetype.create([position, velocity, index]);
const following = Archetype.create([position, velocity, index, target]);

/** `count` entities, each targeting the one spawned before it. */
export const seed = System.create({}, ({ commands }, input: { readonly count: number }) => {
    let previous = commands.spawn(moving)({ [position]: [0, 0, 0], [velocity]: [0, 0, 0], [index]: 0 });
    for (let i = 1; i < input.count; i++) {
        previous = commands.spawn(following)({ [position]: [i, i * 0.5, -i], [velocity]: [1, 0, 0], [index]: i, [target]: previous });
    }
});

/** Despawns a tenth of the entities and spawns as many replacements. */
export const churn = System.create({ components: { read: [index, position] } }, (row, { commands }, input: { readonly group: number }) => {
    if (row[index] % 10 !== input.group) return;
    commands.despawn(row.entity);
    commands.spawn(moving)({ [position]: row[position], [velocity]: [0, 0, 0], [index]: row[index] });
});

/** Adds the tag to one tenth and removes it from another: a fifth of the entities move archetype. */
export const retag = System.create({ components: { read: [index] } }, (row, { commands }, input: { readonly group: number }) => {
    const group = row[index] % 10;
    if (group === input.group) commands.add(row.entity, tag);
    else if (group === (input.group + 5) % 10) commands.remove(row.entity, tag);
});

/** Writes 1% of positions. */
export const poke = System.create({
    kernel: "cpu",
    components: { read: [index], write: [position] },
}, (row, _context, input: { readonly group: I32 }) => {
    if (row[index] % 100 === input.group) {
        const [x, y, z] = row[position];
        row[position] = [x + 1, y, z];
    }
});

/** Writes 1% of positions, clustered in one contiguous run of rows. */
export const pokeCluster = System.create({
    kernel: "cpu",
    components: { read: [index], write: [position] },
}, (row, _context, input: { readonly group: I32 }) => {
    const group = row[index] - input.group * 10_000;
    if (group >= 0 && group < 10_000) {
        const [x, y, z] = row[position];
        row[position] = [x + 1, y, z];
    }
});

/** Sees only what changed since it last ran. */
export const observe = System.create({
    kernel: "cpu",
    components: { read: [position], write: [velocity], changed: [position] },
}, row => {
    const [x, y, z] = row[position];
    row[velocity] = [x * 0.5, y * 0.5, z * 0.5];
});

/** Steers toward the target: one lookup per row. */
export const follow = System.create({
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
    kernel: "cpu",
    components: { read: [index, position] },
}, (row, { commands }) => {
    if (row[index] % 10 === 0) {
        const [x] = row[position];
        commands.add(row.entity, hits, x);
    }
});

/** Six dependent kernels: one tier each, so dispatch cost shows. */
export const chain1 = System.create({ kernel: "cpu", components: { write: [velocity] } }, row => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x * 0.99, y * 0.99, z * 0.99];
});
export const chain2 = System.create({ kernel: "cpu", components: { write: [velocity] }, after: [chain1] }, row => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x * 0.99, y * 0.99, z * 0.99];
});
export const chain3 = System.create({ kernel: "cpu", components: { write: [velocity] }, after: [chain2] }, row => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x * 0.99, y * 0.99, z * 0.99];
});
export const chain4 = System.create({ kernel: "cpu", components: { write: [velocity] }, after: [chain3] }, row => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x * 0.99, y * 0.99, z * 0.99];
});
export const chain5 = System.create({ kernel: "cpu", components: { write: [velocity] }, after: [chain4] }, row => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x * 0.99, y * 0.99, z * 0.99];
});
export const chain6 = System.create({ kernel: "cpu", components: { write: [velocity] }, after: [chain5] }, row => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x * 0.99, y * 0.99, z * 0.99];
});
export const chain = System.create({ systems: [chain1, chain2, chain3, chain4, chain5, chain6] });

/** Fifty small main-thread systems in one tier, each reading every row. */
let total = 0;
export const smalls = System.create({
    systems: Array.from({ length: 50 }, (_, i) => System.create({ components: { read: [position] } }, row => {
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
export const reduce = System.create({ kernel: "cpu", components: { read: [index] }, resources: { reduce: [indexSum, highest] } }, (row, { reduce }) => {
    reduce[indexSum](row[index]);
    reduce[highest](row[index]);
});

/** A system no entity matches: what a run costs with nothing to do. */
export const idle = System.create({ components: { has: [unused] } }, () => {});
/** A system that throws, so each run of it has a report to spawn. */
export const failing = System.create({}, () => { throw new Error("suite: failing"); });
/** An observer system no entity matches: a run of it alone has no tiers. */
export const idleObserver = System.create({ observer: true, components: { has: [unused] } }, () => {});

/** Fifty systems no entity matches, in one tier. */
export const idles = System.create({
    systems: Array.from({ length: 50 }, (_, i) => System.create({ components: { has: [unused] } }, () => {})),
});

/** Spawns one entity: a run with a sync point that applies one command. */
export const spawnOne = System.create({}, ({ commands }) => {
    commands.spawn(moving)({ [position]: [0, 0, 0], [velocity]: [0, 0, 0], [index]: 0 });
});

/** One main-thread system reading every row. */
export const small = System.create({ components: { read: [position] } }, row => {
    total += row[position][0];
});
