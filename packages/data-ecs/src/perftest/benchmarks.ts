import type { Entity } from "../interface/entity/entity.js";
import { toPromise } from "../interface/observe/to-promise.js";
import { World } from "../interface/world/world.js";
import { enabled as flatEnabled, spawnFlat, spawnFlatDynamic, visible as flatVisible } from "./flat.js";
import { enabled, fastest as particlesFastest, move, position as particlePosition, spawn, visible } from "./particles.js";
import { forest, local as hierarchyLocal, nudge, parent as hierarchyParent, propagate, propagateChanged, reparent, sprout, turnover, under } from "./hierarchy.js";
import { chain, churn, emit, fastest, follow, highest, hits, idle, idles, index, indexSum, observe, poke, pokeCluster, position, reduce, retag, seeded, small, smalls, spawnOne, tag, totalOf } from "./suite.js";

import type { Benchmark } from "./benchmark.js";
import { createWorld } from "../implementation/index.js";

const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
};

/** The fastest run of `observe` right after `writer` changes rows. */
const observed = async (world: World, writer: typeof poke | typeof pokeCluster): Promise<number> => {
    let frame = 0;
    let best = Infinity;
    for (let i = 0; i < 60; i++) {
        await world.run(writer, { group: frame++ % 100 });
        const start = performance.now();
        await world.run(observe);
        if (i >= 10) best = Math.min(best, performance.now() - start);
    }
    return best;
};

/** The fastest run of `measured` right after `before` runs, over `rounds` rounds after `warmup`. */
const after = async (before: () => Promise<unknown>, measured: () => Promise<unknown>, rounds = 100, warmup = 20): Promise<number> => {
    let best = Infinity;
    for (let i = 0; i < rounds; i++) {
        await before();
        const start = performance.now();
        await measured();
        if (i >= warmup) best = Math.min(best, performance.now() - start);
    }
    return best;
};

/** A forest of 100K chains of 10, filtered propagation run once, and its roots. */
const filteredForest = async (): Promise<{ readonly world: World; readonly roots: readonly Entity[] }> => {
    const world = createWorld();
    await world.run(forest, { roots: 100_000, depth: 10 });
    await world.run(propagateChanged);
    return { world, roots: await toPromise(world.observe.select({ required: [hierarchyLocal], not: [hierarchyParent] })) };
};

/** Bytes an `up` row moves at best: its own value read, its result written, its parent's result read, and its parent's row. */
const upRow = 28;
/** Bytes per row for a filtered run to find what changed: one 8-byte tick per 1024-row chunk. */
const chunkScan = 8 / 1024;

/** A run's fixed cost at best: it reads one cache line of its system's state. */
const runBest = { bytes: 64, basis: "A run reads at least one cache line of its system's state." };

/** Benchmarks shared by vitest (`*.perf-test.ts`) and the bundled node runner (`run.ts`). */
export const benchmarks: readonly Benchmark[] = [
    {
        name: "run idle",
        operation: "Running one system no entity matches, in a world of 10K entities: the fixed cost of every system in every frame.",
        per: "runs",
        n: 1,
        typical: [1, 1],
        best: runBest,
        run: async () => {
            const world = await seeded(() => createWorld(), 10_000);
            const best = await fastest(() => world.run(idle));
            await world.dispose();
            return best;
        },
    },
    {
        name: "run 50 idle",
        operation: "Running fifty systems no entity matches, as one composite: the fixed cost per system of a frame of many systems.",
        per: "systems",
        n: 50,
        typical: [10, 200],
        best: runBest,
        run: async () => {
            const world = await seeded(() => createWorld(), 10_000);
            const best = await fastest(() => world.run(idles));
            await world.dispose();
            return best;
        },
    },
    {
        name: "sync point one spawn",
        operation: "Running a system that spawns one entity, so its run ends with a sync point that applies one command: the fixed cost of a structural change.",
        per: "runs",
        n: 1,
        typical: [1, 1],
        best: { bytes: 128, basis: "The spawn writes its 28 bytes of values, its entity and its location, and the run reads its system's state." },
        run: async () => {
            const world = await seeded(() => createWorld(), 10_000);
            const best = await fastest(() => world.run(spawnOne));
            await world.dispose();
            return best;
        },
    },
    ...[1_000, 10_000].map((rows): Benchmark => ({
        name: `move ${rows / 1_000}K`,
        operation: "A kernel adding a vec3 to another for the rows with two tags, at a size a typical system sees.",
        per: "matched rows",
        n: rows,
        typical: [1_000, 100_000],
        best: { bytes: 36, basis: "Each row reads 12 bytes of velocity and reads and writes 12 bytes of position." },
        run: async () => {
            const world = createWorld();
            await world.run(spawn, { count: 4 * rows });
            const { minimum } = await particlesFastest(() => world.run(move));
            await world.dispose();
            return minimum;
        },
    })),
    ...[1_000, 10_000].map((rows): Benchmark => ({
        name: `main thread ${rows / 1_000}K`,
        operation: "One main-thread system reading every row: app logic over a typical number of entities.",
        per: "row reads",
        n: rows,
        typical: [1_000, 100_000],
        best: { bytes: 12, basis: "Each row read loads its 12-byte position." },
        run: async () => {
            const world = await seeded(() => createWorld(), rows);
            const best = await fastest(() => world.run(small));
            check(totalOf() > 0, "main thread: nothing read");
            await world.dispose();
            return best;
        },
    })),
    {
        name: "up depth 10 10K",
        operation: "A kernel with `up` computing every row from its parent, over 1K chains of 10: a scene graph of typical size.",
        per: "rows",
        n: 10_000,
        typical: [1_000, 100_000],
        best: { bytes: upRow, basis: "Each row reads its 8-byte value, its parent's 8-byte result and 4-byte row, and writes its 8-byte result." },
        run: async () => {
            const world = createWorld();
            await world.run(forest, { roots: 1_000, depth: 10 });
            const best = await fastest(() => world.run(propagate));
            await world.dispose();
            return best;
        },
    },
    {
        name: "create",
        operation: "Spawning entities of six components, two of them tags, over four archetypes, through a main-thread system and the sync point that applies them: loading a level, a burst of particles.",
        per: "spawns",
        n: 1_000_000,
        typical: [100, 100_000],
        best: { bytes: 48, basis: "Each entity writes its 32 bytes of values, its 8-byte entity and its 8-byte location." },
        run: () => fastest(async () => {
            const world = createWorld();
            await world.run(spawn, { count: 1_000_000 });
            await world.dispose();
        }, 5000, 2),
    },
    {
        name: "create flat",
        operation: "The same spawns with eight scalar components each, values passed inline.",
        per: "spawns",
        n: 1_000_000,
        typical: [100, 100_000],
        best: { bytes: 48, basis: "Each entity writes its 32 bytes of values, its 8-byte entity and its 8-byte location." },
        run: () => fastest(async () => {
            const world = createWorld();
            await world.run(spawnFlat, { count: 1_000_000 });
            check(await toPromise(world.observe.count({ required: [flatVisible, flatEnabled] })) === 250_000, "create flat: wrong count");
            await world.dispose();
        }, 5000, 2),
    },
    {
        name: "create flat dynamic",
        operation: "The same spawns from value objects built first, as spawns from data or from another system's results are.",
        per: "spawns",
        n: 1_000_000,
        typical: [100, 100_000],
        best: { bytes: 48, basis: "Each entity writes its 32 bytes of values, its 8-byte entity and its 8-byte location." },
        run: () => fastest(async () => {
            const world = createWorld();
            await world.run(spawnFlatDynamic, { count: 1_000_000 });
            check(await toPromise(world.observe.count({ required: [flatVisible, flatEnabled] })) === 250_000, "create flat dynamic: wrong count");
            await world.dispose();
        }, 5000, 2),
    },
    {
        name: "move",
        operation: "A kernel adding a vec3 to another for the rows with two tags: integration, animation, any per-row update.",
        per: "matched rows",
        n: 250_000,
        typical: [1_000, 1_000_000],
        best: { bytes: 36, basis: "Each row reads 12 bytes of velocity and reads and writes 12 bytes of position." },
        run: async () => {
            const world = createWorld();
            await world.run(spawn, { count: 1_000_000 });
            check(await toPromise(world.observe.count({ required: [particlePosition, visible, enabled] })) === 250_000, "move: wrong count");
            const { minimum } = await particlesFastest(() => world.run(move));
            await world.dispose();
            return minimum;
        },
    },
    {
        name: "churn",
        operation: "A main-thread system despawning a tenth of its rows and spawning as many: projectiles, particles, pooled UI.",
        per: "rows visited",
        n: 1_000_000,
        typical: [1_000, 100_000],
        best: { bytes: 29, basis: "Each row reads 16 bytes; each tenth swaps the last row into its hole, 88 bytes, and spawns one of 44." },
        run: async () => {
            const world = await seeded(() => createWorld(), 1_000_000);
            let frame = 0;
            const best = await fastest(() => world.run(churn, { group: frame++ % 10 }));
            check(await toPromise(world.observe.count({ required: [index] })) === 1_000_000, "churn: wrong count");
            await world.dispose();
            return best;
        },
    },
    {
        name: "retag",
        operation: "A main-thread system adding a tag to a tenth of its rows and removing it from another tenth: state flags such as selected or visible that move entities between archetypes.",
        per: "rows visited",
        n: 1_000_000,
        typical: [1_000, 100_000],
        best: { bytes: 39, basis: "Each row reads 4 bytes; each fifth moves, copying its 44 bytes and swapping the last row into its hole." },
        run: async () => {
            const world = await seeded(() => createWorld(), 1_000_000);
            let frame = 0;
            const best = await fastest(() => world.run(retag, { group: frame++ % 10 }));
            check(await toPromise(world.observe.count({ required: [tag] })) > 0, "retag: no tags");
            await world.dispose();
            return best;
        },
    },
    {
        name: "sparse changed",
        operation: "A kernel filtered on `changed` after 1% of rows changed, scattered: reacting to edits, such as recomputing bounds of what moved.",
        per: "rows in the archetype",
        n: 1_000_000,
        typical: [10_000, 1_000_000],
        best: { bytes: 8.24, basis: "Every chunk has a change, so each row's 8-byte tick is read; the changed 1% read 12 bytes and write 12." },
        run: async () => {
            const world = await seeded(() => createWorld(), 1_000_000);
            const best = await observed(world, poke);
            await world.dispose();
            return best;
        },
    },
    {
        name: "sparse changed clustered",
        operation: "The same with the 1% in one contiguous run of rows, as edits to recently spawned entities are.",
        per: "rows in the archetype",
        n: 1_000_000,
        typical: [10_000, 1_000_000],
        best: { bytes: 0.33, basis: "Chunk ticks are scanned; the changed 1% read their 8-byte ticks and 24 bytes of values." },
        run: async () => {
            const world = await seeded(() => createWorld(), 1_000_000);
            const best = await observed(world, pokeCluster);
            await world.dispose();
            return best;
        },
    },
    {
        name: "follow",
        operation: "A kernel looking up another entity per row and reading its position: steering toward targets, constraints, attachments.",
        per: "rows",
        n: 1_000_000,
        typical: [1_000, 100_000],
        best: { bytes: 52, basis: "Each row reads 12 bytes of position and an 8-byte target, the target's 8-byte location and 12-byte position, and writes 12." },
        run: async () => {
            const world = await seeded(() => createWorld(), 1_000_000);
            const best = await fastest(() => world.run(follow));
            await world.dispose();
            return best;
        },
    },
    {
        name: "emit",
        operation: "A kernel issuing an add for a tenth of its rows: hits, events or state changes found by a parallel pass.",
        per: "rows",
        n: 1_000_000,
        typical: [1_000, 100_000],
        best: { bytes: 34, basis: "Each row reads 16 bytes; each tenth moves to a new archetype, about 180 bytes." },
        run: async () => {
            const world = await seeded(() => createWorld(), 1_000_000);
            const best = await fastest(() => world.run(emit));
            check(await toPromise(world.observe.count({ required: [hits] })) === 100_000, "emit: wrong count");
            await world.dispose();
            return best;
        },
    },
    {
        name: "reduce",
        operation: "A kernel folding every row into a sum and a maximum: totals, bounds, counts.",
        per: "rows",
        n: 1_000_000,
        typical: [1_000, 1_000_000],
        best: { bytes: 4, basis: "Each row reads its 4-byte value." },
        run: async () => {
            const world = await seeded(() => createWorld(), 1_000_000);
            const best = await fastest(() => world.run(reduce));
            check(await toPromise(world.observe.resource(highest)) === 999_999 && await toPromise(world.observe.resource(indexSum)) === 999_999 * 500_000, "reduce: wrong fold");
            await world.dispose();
            return best;
        },
    },
    {
        name: "chain",
        operation: "Six dependent kernels over the same rows, each reading what the one before wrote: a pipeline of per-row steps.",
        per: "row passes",
        n: 6_000_000,
        typical: [6_000, 6_000_000],
        best: { bytes: 4, basis: "Fused into one pass, each row reads and writes its 12-byte velocity once for all six." },
        run: async () => {
            const world = await seeded(() => createWorld(), 1_000_000);
            const best = await fastest(() => world.run(chain));
            await world.dispose();
            return best;
        },
    },
    ...[[100_000, 10], [1_000, 1_000]].map(([roots, depth]): Benchmark => ({
        name: `up depth ${depth}`,
        operation: `A kernel with \`up\` computing every row from its parent, over ${roots === 1_000 ? "1K chains of 1,000" : "100K chains of 10"}: transforms, inherited visibility or style, recomputed in full.`,
        per: "rows",
        n: 1_000_000,
        typical: [1_000, 100_000],
        best: { bytes: upRow, basis: "Each row reads its 8-byte value, its parent's 8-byte result and 4-byte row, and writes its 8-byte result." },
        run: async () => {
            const world = createWorld();
            await world.run(forest, { roots, depth });
            const best = await fastest(() => world.run(propagate));
            await world.dispose();
            return best;
        },
    })),
    {
        name: "up one root changed",
        operation: "A filtered kernel with `up` after one root's value changed: moving one object in a scene graph.",
        per: "rows",
        n: 1_000_000,
        typical: [1_000, 100_000],
        best: { bytes: chunkScan, basis: "Chunk ticks are scanned; the 10 rows of the changed chain run." },
        run: async () => {
            const { world, roots } = await filteredForest();
            const best = await after(() => world.run(nudge, { entity: roots[0] }), () => world.run(propagateChanged));
            await world.dispose();
            return best;
        },
    },
    {
        name: "up after a spawn",
        operation: "A kernel with `up` computing every row, after a spawn into its tree: a node added to a scene graph each frame.",
        per: "rows",
        n: 1_000_000,
        typical: [1_000, 100_000],
        best: { bytes: upRow, basis: "The run itself, with the order kept current at O(1) for the spawn." },
        run: async () => {
            const world = createWorld();
            await world.run(forest, { roots: 100_000, depth: 10 });
            const roots = await toPromise(world.observe.select({ required: [hierarchyLocal], not: [hierarchyParent] }));
            const best = await after(() => world.run(sprout, { entity: roots[0] }), () => world.run(propagate));
            await world.dispose();
            return best;
        },
    },
    ...[false, true].map((tagged): Benchmark => ({
        name: tagged ? "up filtered after tagged churn" : "up filtered after churn",
        operation: `A filtered kernel with \`up\` after one root changed and 100 leaves were despawned and 100 spawned${tagged ? ", the leaves in an archetype of their own" : " in the tree's archetype"}: a scene graph with ${tagged ? "short-lived children of their own kind, such as effects" : "objects coming and going"}.`,
        per: "rows",
        n: 1_000_000,
        typical: [1_000, 100_000],
        best: { bytes: chunkScan + (210 * upRow) / 1_000_000, basis: "Chunk ticks are scanned; the changed chain and the 200 leaves run; the order is patched for 200 rows." },
        run: async () => {
            const { world, roots } = await filteredForest();
            under.splice(0, under.length, ...roots.slice(1, 101));
            const best = await after(async () => {
                await world.run(turnover, { count: 100, tagged });
                await world.run(nudge, { entity: roots[0] });
            }, () => world.run(propagateChanged));
            await world.dispose();
            return best;
        },
    })),
    {
        name: "up filtered after a reparent",
        operation: "A filtered kernel with `up` after a subtree of 9 rows moved to another parent: dragging an object to a new group.",
        per: "rows",
        n: 1_000_000,
        typical: [1_000, 100_000],
        best: { bytes: chunkScan, basis: "Chunk ticks are scanned; the 9 moved rows are renumbered and run." },
        run: async () => {
            const { world, roots } = await filteredForest();
            const [child] = await toPromise(world.observe.select({ required: [hierarchyParent], where: { [hierarchyParent]: roots[0] } }));
            let frame = 0;
            const best = await after(() => world.run(reparent, { entity: child, to: roots[1 + (frame++ % 2)] }), () => world.run(propagateChanged));
            await world.dispose();
            return best;
        },
    },
    {
        name: "up load",
        operation: "Spawning a forest of 100K chains of 10 and running a kernel with `up` over it once: loading a scene.",
        per: "spawns",
        n: 1_000_000,
        typical: [1_000, 100_000],
        best: { bytes: 40 + upRow, basis: "Each entity writes 24 bytes of values, its entity and its location, then runs once." },
        run: async () => {
            let best = Infinity;
            for (let i = 0; i < 5; i++) {
                const world = createWorld();
                const start = performance.now();
                await world.run(forest, { roots: 100_000, depth: 10 });
                await world.run(propagate);
                best = Math.min(best, performance.now() - start);
                await world.dispose();
            }
            return best;
        },
    },
    {
        name: "up small tree in a big world",
        operation: "A kernel with `up` over a tree of 1K rows after a spawn into it, in a world of 1M other entities: a UI or a rig beside a large simulation.",
        per: "tree rows",
        n: 1_000,
        typical: [100, 10_000],
        best: { bytes: upRow, basis: "The run over the tree, with the order kept current at O(1) for the spawn." },
        run: async () => {
            const world = createWorld();
            await world.run(spawn, { count: 1_000_000 });
            await world.run(forest, { roots: 100, depth: 10 });
            const roots = await toPromise(world.observe.select({ required: [hierarchyLocal], not: [hierarchyParent] }));
            const best = await after(() => world.run(sprout, { entity: roots[0] }), () => world.run(propagate));
            await world.dispose();
            return best;
        },
    },
    {
        name: "main thread",
        operation: "Fifty main-thread systems each reading every row of 1K: many small app systems.",
        per: "row reads",
        n: 50_000,
        typical: [1_000, 100_000],
        best: { bytes: 12, basis: "Each row read loads its 12-byte position." },
        run: async () => {
            const world = await seeded(() => createWorld(), 1_000);
            const best = await fastest(() => world.run(smalls));
            check(totalOf() > 0, "main thread: nothing read");
            await world.dispose();
            return best;
        },
    },
    {
        name: "select",
        operation: "The first value of `observe.select` with `where`, given while subscribing: a query from UI or tools.",
        per: "rows",
        n: 1_000_000,
        typical: [100, 100_000],
        best: { bytes: 8, basis: "Each row reads its 4-byte index; each selected half writes its 8-byte entity." },
        run: async () => {
            const world = await seeded(() => createWorld(), 1_000_000);
            const best = await fastest(async () => {
                const selected = await toPromise(world.observe.select({ required: [position, index], where: { [index]: { "<": 500_000 } } }));
                check(selected.length === 500_000, "select: wrong count");
            });
            await world.dispose();
            return best;
        },
    },
];
