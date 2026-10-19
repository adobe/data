import { Component } from "../interface/component/component.js";
import { Entity } from "../interface/entity/entity.js";
import { Index } from "../interface/indexes/index-type.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";
import { createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";
import { fastest } from "./suite.js";

// Benchmarks of indexes: keeping them current, and looking up through them.

const key = Symbol("indexes/key");
const amount = Symbol("indexes/amount");
const marked = Symbol("indexes/marked");
const serial = Symbol("indexes/serial");
const parent = Symbol("indexes/parent");
const place = Symbol("indexes/place");
const cell = Symbol("indexes/cell");
declare module "@adobe/data-ecs" {
    export interface Components {
        [key]: { type: number };
        [amount]: { type: number };
        [marked]: { type: true };
        [serial]: { type: number };
        [parent]: { type: Entity };
        [place]: { type: readonly [number, number, number] };
        [cell]: { type: readonly [number, number, number] };
    }
}
Component.register(key, { type: { type: "integer", minimum: 0, maximum: 0x7FFFFFFF } });
Component.register(amount, { type: { type: "number" } });
Component.register(marked, { type: { const: true } });
Component.register(serial, { type: { type: "integer", minimum: 0, maximum: 0x7FFFFFFF } });
Component.register(parent, { type: Entity.schema });
Component.register(place, { type: { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } });
Component.register(cell, { type: { type: "array", items: { type: "integer", minimum: -0x80000000, maximum: 0x7FFFFFFF }, minItems: 3, maxItems: 3 } });

const million = 1_000_000;

/** Distinct keys among the indexed entities: ten entities a bucket. */
const keys = million / 10;
const byKey = Index.create({ name: "indexes/byKey", key: [key] });

const seedKeys = System.create({ name: "indexes/seedKeys", input: { type: "object", properties: { count: { type: "integer" }, marked: { type: "integer" } } } }, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) {
        if (i < input.marked) commands.spawn([key, amount, marked])({ [key]: (i * 7919) % keys, [amount]: i, [marked]: true });
        else commands.spawn([key, amount])({ [key]: (i * 7919) % keys, [amount]: i });
    }
});

/** Moves every marked entity to another bucket, and back again the next run. */
let flip = 1;
const rekeyMarked = System.create({ name: "indexes/rekeyMarked", components: { write: [key], has: [marked] } }, row => { row[key] = (row[key] + flip + keys) % keys; });
/** Moves every entity to another bucket. */
const rekeyAll = System.create({ name: "indexes/rekeyAll", components: { write: [key] } }, row => { row[key] = (row[key] + flip + keys) % keys; });

let found = 0;
/** Uses `byKey`, so a run of it refreshes the index. */
const lookOnce = System.create({ name: "indexes/lookOnce", lookup: { byKey: { index: byKey } } }, ({ lookup }) => { found += lookup.byKey(0).length; });

/** The fastest run of `measured` right after `before`. */
const after = async (before: () => Promise<unknown>, measured: () => Promise<unknown>, rounds = 40, warmup = 6): Promise<number> => {
    let best = Infinity;
    for (let i = 0; i < rounds; i++) {
        await before();
        const start = performance.now();
        await measured();
        if (i >= warmup) best = Math.min(best, performance.now() - start);
    }
    return best;
};

const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
};

const inline = (): World => createWorld({ [workers]: 0 });

/** Indexes `index idle` keeps, each over its own thousand entities. */
const idleIndexes = 1000;
const idleKey = Symbol("indexes/idleKey");
declare module "@adobe/data-ecs" {
    export interface Components {
        [idleKey]: { type: number };
    }
}
Component.register(idleKey, { type: { type: "number" } });

/** Unique serials among `unique lookup 1M`'s entities. */
const bySerial = Index.create({ name: "indexes/bySerial", key: [serial], unique: true, components: { has: [amount] } });
const seedSerials = System.create({ name: "indexes/seedSerials" }, ({ commands }) => {
    for (let i = 0; i < million; i++) commands.spawn([serial, amount])({ [serial]: i, [amount]: 1 });
});
let summed = 0;
const lookUnique = System.create({ name: "indexes/lookUnique", lookup: { bySerial: { index: bySerial, read: [amount] } } }, ({ lookup }) => {
    let sum = 0;
    for (let i = 0; i < million; i++) sum += lookup.bySerial(i)?.[amount] ?? 0;
    summed = sum;
});

/** Parents in `children lookup`, with ten children each. */
const parents = 10_000;
const childrenOf = Index.create({ name: "indexes/childrenOf", key: [parent], components: { has: [amount] } });
const seedFamilies = System.create({ name: "indexes/seedFamilies" }, ({ commands }) => {
    for (let p = 0; p < parents; p++) {
        const entity = commands.spawn([marked])({ [marked]: true });
        for (let c = 0; c < 10; c++) commands.spawn([parent, amount])({ [parent]: entity, [amount]: 1 });
    }
});
const sumChildren = System.create({ name: "indexes/sumChildren", components: { has: [marked] }, lookup: { children: { index: childrenOf, read: [amount] } } }, (row, { lookup }) => {
    const children = lookup.children(row.entity);
    for (let i = 0; i < children.length; i++) summed += children.at(i)[amount];
});

/** Particles in `grid neighbors 100K`, in a 100 by 100 by 10 grid of unit cells, ten a cell. */
const particles = 100_000;
const grid = Index.create({ name: "indexes/grid", key: [cell], components: { has: [place] } });
const seedParticles = System.create({ name: "indexes/seedParticles" }, ({ commands }) => {
    for (let i = 0; i < particles; i++) {
        const x = ((i * 7919) % 1000) / 10;
        const y = ((i * 104729) % 1000) / 10;
        const z = ((i * 1299709) % 100) / 10;
        commands.spawn([place, cell])({ [place]: [x, y, z], [cell]: [Math.floor(x), Math.floor(y), Math.floor(z)] });
    }
});
let pushed = 0;
const neighbors = System.create({ name: "indexes/neighbors", components: { read: [place, cell] }, lookup: { near: { index: grid, read: [place] } } }, (row, { lookup }) => {
    const [cx, cy, cz] = row[cell];
    const [x] = row[place];
    let push = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const near = lookup.near([cx + dx, cy + dy, cz + dz]);
        for (let i = 0; i < near.length; i++) push += near.at(i)[place][0] - x;
    }
    pushed += push;
});

export const indexBenchmarks: readonly Benchmark[] = [
    {
        name: "index idle",
        operation: "A run of a system looking up through 1,000 indexes when nothing they hold changed: what keeping an index costs each frame while its entities rest.",
        per: "indexes",
        n: idleIndexes,
        typical: [1, 100],
        best: { bytes: 16, basis: "Each index reads its journal position and its key's last write, 8 bytes each." },
        run: async () => {
            const world = inline();
            const indexes = Array.from({ length: idleIndexes }, () => Index.create({ key: [idleKey] }));
            await world.run(System.create(({ commands }) => { for (let i = 0; i < 1000; i++) commands.spawn([idleKey])({ [idleKey]: i }); }));
            const lookup = Object.fromEntries(indexes.map((index, k) => [`i${k}`, { index }]));
            const user = System.create({ lookup }, () => {});
            const best = await fastest(() => world.run(user));
            await world.dispose();
            return best;
        },
    },
    {
        name: "index refresh 1M 1%",
        operation: "Refreshing a hash index of 1M entities after a system moved 1% of them to other keys: an index kept current as some entities change their key each frame.",
        per: "keys changed",
        n: million / 100,
        typical: [100, 100_000],
        best: { bytes: 48, basis: "Each changed row reads its 8-byte key and tick, and moves a 12-byte entry out of one bucket and into another." },
        run: async () => {
            const world = inline();
            await world.run(seedKeys, { count: million, marked: million / 100 });
            await world.run(lookOnce);
            const best = await after(async () => { flip = -flip; await world.run(rekeyMarked); }, () => world.run(lookOnce));
            check(found > 0, "index refresh 1M 1%: nothing found");
            await world.dispose();
            return best;
        },
    },
    {
        name: "index rebuild 1M main",
        operation: "Building a hash index of 1M entities again after a system moved every one of them to another key, on the world's thread: an index whose keys all change at once.",
        per: "entities",
        n: million,
        typical: [10_000, 1_000_000],
        best: { bytes: 24, basis: "Each entity reads its 8-byte key and location and writes a 12-byte entry." },
        run: async () => {
            const world = inline();
            await world.run(seedKeys, { count: million, marked: 0 });
            await world.run(lookOnce);
            const best = await after(async () => { flip = -flip; await world.run(rekeyAll); }, () => world.run(lookOnce), 12, 2);
            await world.dispose();
            return best;
        },
    },
    {
        name: "unique lookup 1M",
        operation: "1M lookups by key through a unique index, each reading one value of the row it finds, in a main-thread system: a replication map from server ids to entities.",
        per: "lookups",
        n: million,
        typical: [100, 100_000],
        best: { bytes: 24, basis: "Each lookup reads its bucket's 8-byte slot and its 12-byte entry, and a 4-byte value." },
        run: async () => {
            const world = inline();
            await world.run(seedSerials);
            const best = await fastest(() => world.run(lookUnique), 2000, 3);
            check(summed === million, "unique lookup 1M: wrong sum");
            await world.dispose();
            return best;
        },
    },
    {
        name: "children lookup",
        operation: "Each of 10K parents summing a value of its ten children through an index on their parent reference, in a main-thread system: a reverse relationship.",
        per: "children",
        n: parents * 10,
        typical: [100, 100_000],
        best: { bytes: 16, basis: "Each child is a 12-byte entry and a 4-byte value read." },
        run: async () => {
            const world = inline();
            await world.run(seedFamilies);
            summed = 0;
            const best = await fastest(() => world.run(sumChildren), 2000, 3);
            check(summed > 0, "children lookup: nothing summed");
            await world.dispose();
            return best;
        },
    },
    {
        name: "grid neighbors 100K main",
        operation: "Each of 100K particles reading the positions of those in the 27 cells around its own through a hash index on its cell, in a main-thread system: a uniform grid broadphase.",
        per: "rows",
        n: particles,
        typical: [1_000, 100_000],
        best: { bytes: 1000, basis: "Each row probes 27 buckets, a 64-byte line each, and reads about 270 neighbors' 12-byte entries and positions." },
        run: async () => {
            const world = inline();
            await world.run(seedParticles);
            const best = await fastest(() => world.run(neighbors), 3000, 2);
            check(Number.isFinite(pushed), "grid neighbors 100K main: no push");
            await world.dispose();
            return best;
        },
    },
];
