import type { Component } from "../interface/component/component.js";
import type { Entity } from "../interface/entity/entity.js";
import { toPromise } from "../interface/observe/to-promise.js";
import { World } from "../interface/world/world.js";
import { enabled as flatEnabled, spawnFlat, spawnFlatDynamic, visible as flatVisible } from "./flat.js";
import { enabled, fastest as particlesFastest, move, position as particlePosition, spawn, visible } from "./particles.js";
import { forest, local as hierarchyLocal, nudge, parent as hierarchyParent, propagate, propagateChanged, reparent, sprout, turnover, under } from "./hierarchy.js";
import * as structural from "./structural.js";
import { chain, churn, emit, fastest, follow, highest, hits, idle, idles, idleSynced, index, indexSum, observe, poke, pokeCluster, position, reduce, retag, seeded, small, smalls, spawnOne, tag, totalOf } from "./suite.js";

import type { Benchmark } from "./benchmark.js";
import { loopTickIdle, loopTicks, syncedIdles } from "./loop.js";
import { main, placed, pooled } from "./placed.js";
import { wake } from "./wake.js";
import { remoteBenchmarks } from "./remote.js";
import { logBenchmarks } from "./log.js";
import { handoffBenchmarks } from "./handoff.js";
import { finalizedBenchmarks } from "./finalized.js";
import { tailBenchmarks } from "./tails.js";
import { readBenchmarks } from "./reads.js";
import { observedBenchmarks } from "./observed.js";
import { systemBenchmarks } from "./systems.js";
import { indexBenchmarks } from "./indexes.js";
import { createWorld } from "../implementation/index.js";
import { workers } from "../interface/resources/workers.js";

/** A world whose kernels run on this thread, which the benchmarks without a placement measure; `workers` ones use the pool. */
const inline = (): World => createWorld({ [workers]: 0 });

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

/** Entities in each structural benchmark. */
const structuralCount = 100_000;

/** A world of `structuralCount` seeded entities, in one archetype or interleaved over four. */
const structuralWorld = async (sources: 1 | 4): Promise<World> => {
    const world = inline();
    await world.run(structural.seed, { count: structuralCount, sources });
    return world;
};

/** The fastest run of `measured` over a seeded world, after `before` restores what the last one changed. */
const structuralBest = async (sources: 1 | 4, before: (world: World) => Promise<unknown>, measured: (world: World) => Promise<unknown>, verify: (world: World) => Promise<boolean>, name: string): Promise<number> => {
    const world = await structuralWorld(sources);
    const best = await after(() => before(world), () => measured(world), 40, 8);
    check(await verify(world), `${name}: wrong result`);
    await world.dispose();
    return best;
};

const countOf = (world: World, required: readonly Component.Key[]): Promise<number> => toPromise(world.observe.count({ required }));

/** A forest of 100K chains of 10, filtered propagation run once, and its roots. */
const filteredForest = async (): Promise<{ readonly world: World; readonly roots: readonly Entity[] }> => {
    const world = inline();
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
/** The pool's benchmarks node runs too, on `worker_threads`. */
const pooledInNode = new Set(["move workers", "follow workers", "emit workers", "spawn bulk kernel workers", "sync point grow 100 archetypes workers"]);

export const benchmarks: readonly Benchmark[] = [
    {
        name: "run idle",
        operation: "Running one system no entity matches, in a world of 10K entities: the fixed cost of every system in every frame.",
        per: "runs",
        n: 1,
        typical: [1, 1],
        best: runBest,
        run: async () => {
            const world = await seeded(() => inline(), 10_000);
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
            const world = await seeded(() => inline(), 10_000);
            const best = await fastest(() => world.run(idles));
            await world.dispose();
            return best;
        },
    },
    {
        name: "run synced",
        operation: "Running one synced system no entity matches, in a world of 10K entities: a run with no tiers, its sync point empty, against `run idle`.",
        per: "runs",
        n: 1,
        typical: [1, 1],
        best: runBest,
        run: async () => {
            const world = await seeded(() => inline(), 10_000);
            const best = await fastest(() => world.run(idleSynced));
            await world.dispose();
            return best;
        },
    },
    {
        name: "synced idle 100",
        operation: "Ticks as in `loop tick idle`, with a hundred synced systems no entity matches added, each run after every tick: the cost per synced system per pass, a hundredth of the tick's own cost included.",
        per: "synced systems",
        n: loopTicks * syncedIdles,
        typical: [1, 100],
        best: runBest,
        run: () => loopTickIdle(5, syncedIdles),
    },
    {
        name: "loop tick idle",
        operation: "A world's loop ticking with nothing changed, driven back to back with `always` set, counted through an observer of its clock: the fixed cost of every tick.",
        per: "ticks",
        n: loopTicks,
        typical: [1, 1],
        best: runBest,
        run: () => loopTickIdle(),
    },
    {
        name: "sync point one spawn",
        operation: "Running a system that spawns one entity, so its run ends with a sync point that applies one command: the fixed cost of a structural change.",
        per: "runs",
        n: 1,
        typical: [1, 1],
        best: { bytes: 128, basis: "The spawn writes its 28 bytes of values, its entity and its location, and the run reads its system's state." },
        run: async () => {
            const world = await seeded(() => inline(), 10_000);
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
            const world = inline();
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
            const world = await seeded(() => inline(), rows);
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
            const world = inline();
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
            const world = inline();
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
            const world = inline();
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
            const world = inline();
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
            const world = inline();
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
            const world = await seeded(() => inline(), 1_000_000);
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
            const world = await seeded(() => inline(), 1_000_000);
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
            const world = await seeded(() => inline(), 1_000_000);
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
            const world = await seeded(() => inline(), 1_000_000);
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
            const world = await seeded(() => inline(), 1_000_000);
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
            const world = await seeded(() => inline(), 1_000_000);
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
            const world = await seeded(() => inline(), 1_000_000);
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
            const world = await seeded(() => inline(), 1_000_000);
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
            const world = inline();
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
            const world = inline();
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
                const world = inline();
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
            const world = inline();
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
            const world = await seeded(() => inline(), 1_000);
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
            const world = await seeded(() => inline(), 1_000_000);
            const best = await fastest(async () => {
                const selected = await toPromise(world.observe.select({ required: [position, index], where: { [index]: { "<": 500_000 } } }));
                check(selected.length === 500_000, "select: wrong count");
            });
            await world.dispose();
            return best;
        },
    },
    {
        name: "spawn bulk",
        operation: "A main-thread system spawning 100K entities of one archetype, applied by its sync point: loading many of one kind.",
        per: "spawns",
        n: structuralCount,
        typical: [100, 100_000],
        best: { bytes: 24, basis: "Each entity writes its 8 bytes of values, its 8-byte entity and its 8-byte location." },
        run: () => structuralBest(1, world => world.run(structural.despawnSpawned), world => world.run(structural.spawnBulk, { count: structuralCount }),
            async world => await countOf(world, [structural.spawned]) === structuralCount, "spawn bulk"),
    },
    {
        name: "spawn bulk kernel",
        operation: "A kernel spawning an entity per row over 100K rows: spawns found by a parallel pass, such as debris or hits.",
        per: "spawns",
        n: structuralCount,
        typical: [100, 100_000],
        best: { bytes: 28, basis: "Each row reads its 4-byte index; each spawn writes its 8 bytes of values, its entity and its location." },
        run: () => structuralBest(1, world => world.run(structural.despawnSpawned), world => world.run(structural.spawnKernel),
            async world => await countOf(world, [structural.spawned]) === structuralCount, "spawn bulk kernel"),
    },
    {
        name: "spawn singles",
        operation: "A run spawning one entity of each of four archetypes: the fixed cost of a few spawns a frame, such as a click or a message.",
        per: "spawns",
        n: 4,
        typical: [1, 10],
        best: { bytes: 64 / 4 + 24, basis: "Each entity writes its values, entity and location, and the run reads a cache line of its system's state." },
        run: async () => {
            const world = await structuralWorld(1);
            const best = await fastest(() => world.run(structural.spawnSingles));
            check(await countOf(world, [structural.spawned]) > 0, "spawn singles: nothing spawned");
            await world.dispose();
            return best;
        },
    },
    {
        name: "spawn sixteen archetypes",
        operation: "Spawns from value objects over sixteen archetypes, more component sets than spawns cache: entities of many kinds, from data.",
        per: "spawns",
        n: structuralCount,
        typical: [100, 100_000],
        best: { bytes: 24, basis: "Each entity writes its 8 bytes of values, its 8-byte entity and its 8-byte location." },
        run: () => structuralBest(1, world => world.run(structural.despawnSpawned), world => world.run(structural.spawnSixteen, { count: structuralCount }),
            async world => await countOf(world, [structural.spawned]) === structuralCount, "spawn sixteen archetypes"),
    },
    {
        name: "despawn bulk",
        operation: "A main-thread system despawning 100K entities over four archetypes: unloading a level.",
        per: "despawns",
        n: structuralCount,
        typical: [100, 100_000],
        best: { bytes: 16, basis: "Each despawn frees its 8-byte location and entity; the archetypes empty, so no row moves." },
        run: () => structuralBest(4, world => world.run(structural.seed, { count: structuralCount, sources: 4 }), world => world.run(structural.despawnAll),
            async world => await countOf(world, [structural.index]) === 0, "despawn bulk"),
    },
    {
        name: "despawn bulk kernel",
        operation: "The same despawns from a kernel.",
        per: "despawns",
        n: structuralCount,
        typical: [100, 100_000],
        best: { bytes: 20, basis: "Each row reads its 4-byte index; each despawn frees its location and entity." },
        run: () => structuralBest(4, world => world.run(structural.seed, { count: structuralCount, sources: 4 }), world => world.run(structural.despawnKernel),
            async world => await countOf(world, [structural.index]) === 0, "despawn bulk kernel"),
    },
    {
        name: "despawn one",
        operation: "A run despawning one entity of 100K: the fixed cost of a despawn, such as one projectile hitting.",
        per: "despawns",
        n: 1,
        typical: [1, 10],
        best: { bytes: 64 + 32, basis: "The despawn swaps the last row into its hole and frees its location, and the run reads its system's state." },
        run: async () => {
            const world = await structuralWorld(1);
            const best = await after(() => world.run(structural.spawnOne), () => world.run(structural.despawnOne), 2_000, 200);
            check(await countOf(world, [structural.spawned]) === 0, "despawn one: entities left");
            await world.dispose();
            return best;
        },
    },
    ...([
        ["add tag", "Adding a tag to 100K entities of one archetype: a state flag set on many at once.", 1, structural.removeFlag, structural.addFlag, [structural.flag], 16],
        ["add tag kernel", "The same adds from a kernel.", 1, structural.removeFlagKernel, structural.addFlagKernel, [structural.flag], 20],
        ["add tag from four archetypes", "Adding a tag to 100K entities over four archetypes, each moving to its own target.", 4, structural.removeFlag, structural.addFlag, [structural.flag], 16],
        ["add value", "Adding a valued component to 100K entities of one archetype: attaching data such as a timer or a score.", 1, structural.removeAmount, structural.addAmount, [structural.amount], 20],
        ["add several", "Adding a tag and two values at once to 100K entities: attaching a bundle of components.", 1, structural.removeSeveral, structural.addSeveral, [structural.flag, structural.amount, structural.extra], 24],
        ["remove tag", "Removing a tag from 100K entities of one archetype.", 1, structural.addFlag, structural.removeFlag, null, 16],
        ["remove tag kernel", "The same removes from a kernel.", 1, structural.addFlagKernel, structural.removeFlagKernel, null, 20],
        ["remove tag from four archetypes", "Removing a tag from 100K entities over four archetypes.", 4, structural.addFlag, structural.removeFlag, null, 16],
        ["remove several", "Removing a tag and two values at once from 100K entities.", 1, structural.addSeveral, structural.removeSeveral, null, 16],
    ] as const).map(([name, operation, sources, before, measured, added, bytes]): Benchmark => ({
        name,
        operation,
        per: "entities moved",
        n: structuralCount,
        typical: [100, 100_000],
        best: { bytes, basis: "Each entity copies its row to the target archetype and its location changes; the source empties, so no row swaps into a hole." },
        run: () => structuralBest(sources, world => world.run(before), world => world.run(measured),
            async world => added === null ? await countOf(world, [structural.flag]) === 0 : await countOf(world, added) === structuralCount, name),
    })),
    {
        name: "add replace",
        operation: "Adding a value 100K entities already have: values replaced and marked changed, with no archetype moves.",
        per: "entities",
        n: structuralCount,
        typical: [100, 100_000],
        best: { bytes: 12, basis: "Each row reads its 4-byte value and writes 4 bytes, plus its 4-byte location read." },
        run: async () => {
            const world = await structuralWorld(1);
            await world.run(structural.addAmount);
            const best = await fastest(() => world.run(structural.replaceAmount));
            check(await countOf(world, [structural.amount]) === structuralCount, "add replace: wrong count");
            await world.dispose();
            return best;
        },
    },
    ...placed([main]).filter(benchmark => benchmark.name === "emit main"),
    ...placed([pooled]).filter(benchmark => pooledInNode.has(benchmark.name)),
    wake,
    ...remoteBenchmarks,
    ...logBenchmarks,
    ...handoffBenchmarks,
    ...finalizedBenchmarks,
    ...tailBenchmarks,
    ...readBenchmarks,
    ...observedBenchmarks,
    ...systemBenchmarks,
    ...indexBenchmarks,
];
