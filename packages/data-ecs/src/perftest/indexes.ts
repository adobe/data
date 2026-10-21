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
/** Every hardware thread but the world's. */
const threads = navigator.hardwareConcurrency - 1;
const pooled = (): World => createWorld({ [workers]: threads });

/** A kernel touching nothing, so a world's pool starts, as it does with its first kernel. */
const startPool = System.create({ name: "indexes/startPool", kernel: "cpu", components: { has: [marked] } }, () => {});

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
/** The same on a kernel: on the pool, each row's 27 probes in straight-line code. */
const neighborsKernel = System.create({ name: "indexes/neighborsKernel", kernel: "cpu", components: { read: [place, cell], write: [amount] }, lookup: { near: { index: grid, read: [place] } } }, (row, { lookup }) => {
    const [cx, cy, cz] = row[cell];
    const [x] = row[place];
    let push = 0;
    for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const near = lookup.near([cx + dx, cy + dy, cz + dz]);
                for (let i = 0; i < near.length; i++) {
                    const [nx] = near.at(i)[place];
                    push += nx - x;
                }
            }
        }
    }
    row[amount] = push;
});
const seedKernelParticles = System.create({ name: "indexes/seedKernelParticles" }, ({ commands }) => {
    for (let i = 0; i < particles; i++) {
        const x = ((i * 7919) % 1000) / 10;
        const y = ((i * 104729) % 1000) / 10;
        const z = ((i * 1299709) % 100) / 10;
        commands.spawn([place, cell, amount])({ [place]: [x, y, z], [cell]: [Math.floor(x), Math.floor(y), Math.floor(z)], [amount]: 0 });
    }
});

/** Particles of `rekey 1M`, drifting through cells of 4 units. */
const drifting = million;
const drift = System.create({ name: "indexes/drift", kernel: "cpu", components: { write: [place] } }, row => {
    const [x, y, z] = row[place];
    row[place] = [x + 0.25, y, z];
});
/** The cell a particle is in, written only when it crosses into another, so the index's work is the crossings. */
const rekeyCells = System.create({ name: "indexes/rekeyCells", kernel: "cpu", components: { read: [place], write: [cell], changed: [place] }, after: [drift] }, row => {
    const [x, y, z] = row[place];
    const [cx, cy, cz] = row[cell];
    const nx = Math.floor(x / 4);
    const ny = Math.floor(y / 4);
    const nz = Math.floor(z / 4);
    if (nx !== cx || ny !== cy || nz !== cz) row[cell] = [nx, ny, nz];
});
const coarse = Index.create({ name: "indexes/coarse", key: [cell], components: { has: [place] } });
/** Uses `coarse` once, so a run refreshes it. */
const lookCoarse = System.create({ name: "indexes/lookCoarse", lookup: { coarse: { index: coarse } }, after: [rekeyCells] }, ({ lookup }) => { found += lookup.coarse([0, 0, 0]).length; });
const frame = System.create({ name: "indexes/frame", systems: [drift, rekeyCells, lookCoarse] });
const seedDrifting = System.create({ name: "indexes/seedDrifting" }, ({ commands }) => {
    for (let i = 0; i < drifting; i++) {
        const x = (i * 7919) % 4000 / 10;
        const y = (i * 104729) % 4000 / 10;
        commands.spawn([place, cell])({ [place]: [x, y, 0], [cell]: [Math.floor(x / 4), Math.floor(y / 4), 0] });
    }
});
/** The same frame without the index: what computing the key costs alone. */
const frameUnindexed = System.create({ name: "indexes/frameUnindexed", systems: [drift, rekeyCells] });

/** Rows of `order run 100K`, ranked in a scattered order. */
const orderedRows = 100_000;
const byRank = Index.create({ name: "indexes/byRank", key: [serial], sorted: true, components: { has: [amount] } });
const seedRanked = System.create({ name: "indexes/seedRanked" }, ({ commands }) => {
    for (let i = 0; i < orderedRows; i++) {
        if (i < orderedRows / 100) commands.spawn([serial, amount, marked])({ [serial]: (i * 7919) % orderedRows, [amount]: i });
        else commands.spawn([serial, amount])({ [serial]: (i * 7919) % orderedRows, [amount]: i });
    }
});
let accumulated = 0;
/** Sums its rows' amounts, weighting each by the sum so far, so the order rows run in is part of the result. */
const inRankOrder = System.create({ name: "indexes/inRankOrder", components: { read: [amount] }, order: byRank }, row => {
    accumulated = (accumulated * 31 + row[amount]) % 1000003;
});
const inStorageOrder = System.create({ name: "indexes/inStorageOrder", components: { read: [amount] } }, row => {
    accumulated = (accumulated * 31 + row[amount]) % 1000003;
});
const changedInRankOrder = System.create({ name: "indexes/changedInRankOrder", components: { read: [amount], changed: [amount] }, order: byRank }, row => {
    accumulated = (accumulated * 31 + row[amount]) % 1000003;
});
const bumpMarked = System.create({ name: "indexes/bumpMarked", components: { write: [amount], has: [marked] } }, row => { row[amount] += 1; });

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

/** Ranks of `sorted range 1M`, one an entity, and the ranges it looks up, ten ranks each. */
const ranked = Index.create({ name: "indexes/ranked", key: [serial], sorted: true, components: { has: [amount] } });
const ranges = 10_000;
const lookRanges = System.create({ name: "indexes/lookRanges", lookup: { ranked: { index: ranked, read: [amount] } } }, ({ lookup }) => {
    let sum = 0;
    for (let r = 0; r < ranges; r++) {
        const start = (r * 7919) % (million - 10);
        const range = lookup.ranked({ ">=": start, "<": start + 10 });
        for (let i = 0; i < range.length; i++) sum += range.at(i)[amount];
    }
    summed = sum;
});

/** Entities `sorted page 100K` pages through, by a value one of them changes each run, the page the 20 after the first 100 with a small rank. */
const pageRows = 100_000;
const byAmount = Index.create({ name: "indexes/byAmount", key: [amount], sorted: true, components: { has: [key] } });
const seedPage = System.create({ name: "indexes/seedPage" }, ({ commands }) => {
    commands.spawn([amount, key, marked])({ [amount]: 0, [key]: 0, [marked]: true });
    for (let i = 1; i < pageRows; i++) commands.spawn([amount, key])({ [amount]: (i * 7919) % pageRows, [key]: i });
});
const nudgeAmount = System.create({ name: "indexes/nudgeAmount", components: { has: [marked], write: [amount] } }, row => { row[amount] += 1; });
let page: number[] = [];
/** The page, recomputed only when what it reads changed: the 20 rows after the first 100 with a key below half, highest amounts first. */
const readPage = System.create({ name: "indexes/readPage", lookup: { byAmount: { index: byAmount, read: [key], changed: [key] } }, after: [nudgeAmount] }, ({ lookup }) => {
    const all = lookup.byAmount();
    if (!all.changed) return;
    const rows: number[] = [];
    let skipped = 0;
    for (let i = all.length - 1; i >= 0 && rows.length < 20; i--) {
        const row = all.at(i);
        if (row[key] >= pageRows / 2) continue;
        if (skipped++ < 100) continue;
        rows.push(row.entity);
    }
    page = rows;
});
const nudgeThenPage = System.create({ name: "indexes/nudgeThenPage", systems: [nudgeAmount, readPage] });

/** Entities of the keyless benchmarks, and the 1% of them `keyless refresh 1M 1%` moves in and out. */
const tagged = Symbol("indexes/tagged");
declare module "@adobe/data-ecs" {
    export interface Components {
        [tagged]: { type: true };
    }
}
Component.register(tagged, { type: { const: true } });
const untagged = Index.create({ name: "indexes/untagged", key: [], components: { has: [amount], not: [tagged] } });
const seedAmounts = System.create({ name: "indexes/seedAmounts" }, ({ commands }) => {
    for (let i = 0; i < million; i++) {
        if (i % 100 === 0) commands.spawn([amount, marked])({ [amount]: i, [marked]: true });
        else commands.spawn([amount])({ [amount]: i });
    }
});
/** Tags every marked entity, which leaves the index, and untags them the next run, which enter it again. */
let tagging = true;
const toggleMarked = System.create({ name: "indexes/toggleMarked", components: { has: [marked] } }, (row, { commands }) => {
    if (tagging) commands.add(row.entity, tagged);
    else commands.remove(row.entity, tagged);
});
const lookUntagged = System.create({ name: "indexes/lookUntagged", lookup: { untagged: { index: untagged } } }, ({ lookup }) => { found += lookup.untagged().length; });
/** Despawns the entities it spawned the run before and spawns as many again. */
let spawnedLast: Entity[] = [];
const spawnAndDespawn = System.create({ name: "indexes/spawnAndDespawn" }, ({ commands }) => {
    for (const entity of spawnedLast) commands.despawn(entity);
    const spawned: Entity[] = [];
    for (let i = 0; i < million / 100; i++) spawned.push(commands.spawn([amount])({ [amount]: i }));
    spawnedLast = spawned;
});
/** Writes every entity's amount, which the index holds by but doesn't watch. */
const writeAmounts = System.create({ name: "indexes/writeAmounts", kernel: "cpu", components: { write: [amount] } }, row => { row[amount] = row[amount] + 1; });
/** Reads the index's length and whether it changed, as a count kept by a system would. */
const lengthReads = 100_000;
const readLengths = System.create({ name: "indexes/readLengths", lookup: { untagged: { index: untagged } } }, ({ lookup }) => {
    let sum = 0;
    for (let i = 0; i < lengthReads; i++) {
        const rows = lookup.untagged();
        sum += rows.changed ? 1 : rows.length;
    }
    found = sum;
});

/** Entities a flag sorts into two buckets, as a todo list's done does; and observer systems watching their counts. */
const flagged = 10_000;
const watchers = 100;
const flag = Symbol("indexes/flag");
declare module "@adobe/data-ecs" {
    export interface Components {
        [flag]: { type: boolean };
    }
}
Component.register(flag, { type: { type: "boolean" } });
const byFlag = Index.create({ name: "indexes/byFlag", key: [flag] });
const seedFlags = System.create({ name: "indexes/seedFlags" }, ({ commands }) => {
    for (let i = 0; i < flagged; i++) commands.spawn([flag])({ [flag]: i % 2 === 0 });
});
/** A run of observer systems alone, which passes every one added. */
const pass = System.create({ name: "indexes/pass", observer: true }, () => {});
/** A count of each bucket, written only when the index's entries changed: by `changed: true`, or by its lists' `changed`. */
const countsWhenChanged = (filtered: boolean): System => filtered
    ? System.create({ observer: true, lookup: { byFlag: { index: byFlag, changed: true } } }, ({ lookup }) => {
        found += lookup.byFlag(false).length + lookup.byFlag(true).length;
    })
    : System.create({ observer: true, lookup: { byFlag: { index: byFlag } } }, ({ lookup }) => {
        const off = lookup.byFlag(false);
        const on = lookup.byFlag(true);
        if (!off.changed && !on.changed) return;
        found += off.length + on.length;
    });
/** The fastest pass of `watchers` observer systems of counts while the index rests. */
const restingCounts = async (filtered: boolean): Promise<number> => {
    const world = inline();
    await world.run(seedFlags);
    for (let k = 0; k < watchers; k++) world.add(countsWhenChanged(filtered));
    found = 0;
    await world.run(pass);
    check(found === watchers * flagged, "every observer system counts on its first pass");
    const best = await fastest(() => world.run(pass));
    check(found === watchers * flagged, "none counts again while the index rests");
    await world.dispose();
    return best;
};

export const indexBenchmarks: readonly Benchmark[] = [
    {
        name: "observer index unchanged 100",
        operation: "A pass of 100 observer systems, each writing two buckets' counts of a 10K-entity index only when its entries changed, by `changed: true`, while nothing changes: what such a binding costs each frame at rest, the pass's own cost included.",
        per: "observer systems",
        n: watchers,
        typical: [1, 100],
        best: { bytes: 8, basis: "Each observer system compares its index's changed tick, 8 bytes." },
        run: () => restingCounts(true),
    },
    {
        name: "observer index unchanged 100 by lists",
        operation: "As `observer index unchanged 100`, each body looking up both buckets and returning when neither list changed: the saving `changed: true` makes.",
        per: "observer systems",
        n: watchers,
        typical: [1, 100],
        best: { bytes: 8, basis: "Each observer system compares its index's changed tick, 8 bytes." },
        run: () => restingCounts(false),
    },
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
        name: "keyless index idle",
        operation: "A run of a system looking up through 1,000 indexes without a key when nothing they hold changed: what keeping a membership costs each frame while its entities rest.",
        per: "indexes",
        n: idleIndexes,
        typical: [1, 100],
        best: { bytes: 8, basis: "Each index reads its journal position, 8 bytes." },
        run: async () => {
            const world = inline();
            const indexes = Array.from({ length: idleIndexes }, () => Index.create({ key: [], components: { has: [idleKey] } }));
            await world.run(System.create(({ commands }) => { for (let i = 0; i < 1000; i++) commands.spawn([idleKey])({ [idleKey]: i }); }));
            const lookup = Object.fromEntries(indexes.map((index, k) => [`i${k}`, { index }]));
            const user = System.create({ lookup }, () => {});
            const best = await fastest(() => world.run(user));
            await world.dispose();
            return best;
        },
    },
    {
        name: "keyless refresh 1M 1%",
        operation: "Refreshing an index without a key of 1M entities after 1% of them, spread through entity order, left it or entered it again at a sync point: a membership kept current as some entities gain or lose a tag each frame.",
        per: "entities entering or leaving",
        n: million / 100,
        typical: [100, 100_000],
        best: { bytes: 24, basis: "Each entity reads its 4-byte journal entry and its 8-byte location, and moves a 12-byte entry in or out." },
        run: async () => {
            const world = inline();
            await world.run(seedAmounts);
            await world.run(lookUntagged);
            const best = await after(async () => { tagging = !tagging; await world.run(toggleMarked); }, () => world.run(lookUntagged));
            check(found > 0, "keyless refresh 1M 1%: nothing found");
            await world.dispose();
            return best;
        },
    },
    {
        name: "keyless spawn 1M 1%",
        operation: "Refreshing an index without a key of 1M entities after a sync point despawned the 1% spawned the frame before and spawned as many again: a membership of entities that come and go in bursts, as particles do.",
        per: "entities spawned or despawned",
        n: million / 50,
        typical: [100, 100_000],
        best: { bytes: 24, basis: "Each entity reads its 4-byte journal entry and its 8-byte location, and moves a 12-byte entry in or out." },
        run: async () => {
            const world = inline();
            await world.run(seedAmounts);
            await world.run(lookUntagged);
            const best = await after(() => world.run(spawnAndDespawn), () => world.run(lookUntagged));
            check(found > 0, "keyless spawn 1M 1%: nothing found");
            await world.dispose();
            return best;
        },
    },
    {
        name: "keyless write 1M",
        operation: "Refreshing an index without a key of 1M entities after a kernel wrote a component every one of them has, which the index holds by but no lookup watches: a membership costs nothing for the values its entities write each frame.",
        per: "rows written",
        n: million,
        typical: [10_000, 1_000_000],
        best: { bytes: 0.001, basis: "Nothing it holds changed: the index reads its journal position and nothing per row." },
        run: async () => {
            const world = inline();
            await world.run(seedAmounts);
            await world.run(lookUntagged);
            const best = await after(() => world.run(writeAmounts), () => world.run(lookUntagged));
            await world.dispose();
            return best;
        },
    },
    {
        name: "keyless length",
        operation: "100K lookups through an index without a key of 1M entities, each reading its length and whether it changed, in a main-thread system: a count a system keeps.",
        per: "lookups",
        n: lengthReads,
        typical: [1, 1_000],
        best: { bytes: 16, basis: "Each lookup reads its length and its range's newest tick, 8 bytes each." },
        run: async () => {
            const world = inline();
            await world.run(seedAmounts);
            await world.run(readLengths);
            const best = await fastest(() => world.run(readLengths), 2000, 3);
            check(found > 0, "keyless length: nothing found");
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
        name: "index rebuild 1M workers",
        operation: "Building a hash index of 1M entities again after a system moved every one of them to another key, across the pool: an index whose keys all change at once.",
        per: "entities",
        n: million,
        typical: [10_000, 1_000_000],
        best: { bytes: 24, basis: "Each entity reads its 8-byte key and location and writes a 12-byte entry.", on: "threads" },
        run: async () => {
            const world = pooled();
            await world.run(seedKeys, { count: million, marked: 0 });
            await world.run(startPool);
            await world.run(lookOnce);
            const best = await after(async () => { flip = -flip; await world.run(rekeyAll); }, () => world.run(lookOnce), 12, 2);
            await world.dispose();
            return best;
        },
    },
    {
        name: "rekey 1M",
        operation: "A frame of 1M particles drifting a quarter unit, a kernel writing each one's cell of 4 units only when it crosses into another, and the index on the cell refreshed for its reader: a computed key kept as a component.",
        per: "rows",
        n: drifting,
        typical: [10_000, 1_000_000],
        best: { bytes: 36, basis: "Each row reads and writes its 12-byte position and reads its 12-byte cell; a crossing also moves its 12-byte entry." },
        run: async () => {
            const world = inline();
            await world.run(seedDrifting);
            await world.run(lookCoarse);
            const best = await fastest(() => world.run(frame), 1000, 2);
            check(found > 0, "rekey 1M: nothing found");
            await world.dispose();
            return best;
        },
    },
    {
        name: "rekey 1M unindexed",
        operation: "The frame of `rekey 1M` without the index: the drift and the kernel computing each particle's cell, what the key costs before the index keeps it.",
        per: "rows",
        n: drifting,
        typical: [10_000, 1_000_000],
        best: { bytes: 36, basis: "Each row reads and writes its 12-byte position and reads its 12-byte cell." },
        run: async () => {
            const world = inline();
            await world.run(seedDrifting);
            const best = await fastest(() => world.run(frameUnindexed), 1000, 2);
            await world.dispose();
            return best;
        },
    },
    {
        name: "order run 100K",
        operation: "A main-thread system running 100K rows in the order of a sorted index whose ranks are scattered through storage: views laid out by sibling rank, timelines in time order.",
        per: "rows",
        n: orderedRows,
        typical: [100, 100_000],
        best: { bytes: 20, basis: "Each row reads its 12-byte entry in key order and its 8-byte value." },
        run: async () => {
            const world = inline();
            await world.run(seedRanked);
            const best = await fastest(() => world.run(inRankOrder), 2000, 3);
            await world.dispose();
            return best;
        },
    },
    {
        name: "order run 100K storage order",
        operation: "The system of `order run 100K` without `order`, its rows in storage order: what running the rows costs alone.",
        per: "rows",
        n: orderedRows,
        typical: [100, 100_000],
        best: { bytes: 8, basis: "Each row reads its 8-byte value." },
        run: async () => {
            const world = inline();
            await world.run(seedRanked);
            const best = await fastest(() => world.run(inStorageOrder), 2000, 3);
            await world.dispose();
            return best;
        },
    },
    {
        name: "order filtered 100K 1%",
        operation: "A main-thread system with a change filter running, in a sorted index's order, the 1% of 100K rows that changed since it last ran: reacting to edits in document order.",
        per: "rows changed",
        n: orderedRows / 100,
        typical: [10, 10_000],
        best: { bytes: 40, basis: "Each changed row reads its tick, its entry's position and its 12-byte entry, and its 8-byte value." },
        run: async () => {
            const world = inline();
            await world.run(seedRanked);
            await world.run(changedInRankOrder);
            const best = await after(() => world.run(bumpMarked), () => world.run(changedInRankOrder));
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
        name: "sorted range 1M",
        operation: "10K lookups of a range of ten keys through a sorted index of 1M entities, each reading a value of its rows, in a main-thread system: timelines, intervals, nearest by order.",
        per: "range lookups",
        n: ranges,
        typical: [100, 100_000],
        best: { bytes: 192, basis: "Each lookup reads two lines of the blocks' first keys and ten 16-byte entries and their 4-byte values." },
        run: async () => {
            const world = inline();
            await world.run(seedSerials);
            const best = await fastest(() => world.run(lookRanges), 2000, 3);
            check(summed === ranges * 10, "sorted range 1M: wrong sum");
            await world.dispose();
            return best;
        },
    },
    {
        name: "sorted page 100K",
        operation: "A run that changes one entity's value, and a system reading the 20 rows after the first 100 with a small key, highest values first, through a sorted index on the value, recomputed when it changed: `select page 100K` as a system reading an index.",
        per: "rows",
        n: pageRows,
        typical: [1_000, 100_000],
        best: { bytes: 16, basis: "Each row reads its 8-byte rank and its 8-byte value, as `select page 100K`'s rows do." },
        run: async () => {
            const world = inline();
            await world.run(seedPage);
            const best = await fastest(() => world.run(nudgeThenPage));
            check(page.length === 20, "sorted page 100K: wrong page");
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
    {
        name: "grid neighbors 100K workers",
        operation: "Each of 100K particles reading the positions of those in the 27 cells around its own through a hash index on its cell, in a kernel across the pool: a uniform grid broadphase.",
        per: "rows",
        n: particles,
        typical: [1_000, 100_000],
        best: { bytes: 1000, basis: "Each row probes 27 buckets, a 64-byte line each, and reads about 270 neighbors' 12-byte entries and positions.", on: "threads" },
        run: async () => {
            const world = pooled();
            await world.run(seedKernelParticles);
            const best = await fastest(() => world.run(neighborsKernel), 3000, 2);
            await world.dispose();
            return best;
        },
    },
];
