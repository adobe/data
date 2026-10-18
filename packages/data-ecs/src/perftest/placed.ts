import type { World } from "../interface/world/world.js";
import { workers } from "../interface/resources/workers.js";
import { createWorld } from "../implementation/world/create.js";
import type { Benchmark, Best } from "./benchmark.js";
import { forest, propagate } from "./hierarchy.js";
import { fastest as particlesFastest, move, spawn } from "./particles.js";
import { chain, fastest, follow, observe, poke, seeded } from "./suite.js";
import * as structural from "./structural.js";
import { bumpEach, fillEach, spawnEach } from "./growth.js";

/** Benchmarks run on the world's thread alone and on the pool, in chromium and, for some, in node. */

/** Doublings `sync point grow 100 archetypes` times, from archetypes of 16 rows, in each of `rounds` worlds. */
const doublings = 6;
const rounds = 8;

/** Every hardware thread but the world's. */
export const threads = navigator.hardwareConcurrency - 1;

export type Placement = { readonly label: string; readonly workers: number; readonly on?: Best["on"] };
export const main: Placement = { label: "main", workers: 0 };
export const pooled: Placement = { label: "workers", workers: threads, on: "threads" };

/** A world of the placement, measured, then disposed. */
const measured = async (placement: Placement, run: (world: World) => Promise<number>): Promise<number> => {
    const world = createWorld({ [workers]: placement.workers });
    try {
        return await run(world);
    } finally {
        await world.dispose();
    }
};

export const upOperation = (chains: string): string => `A kernel with \`up\` computing every row from its parent, over ${chains}: transforms, inherited visibility or style, recomputed in full.`;
export const upBest = { bytes: 28, basis: "Each row reads its 8-byte value, its parent's 8-byte result and 4-byte row, and writes its 8-byte result." };

/** The benchmarks of each placement. */
export const placed = (placements: readonly Placement[]): readonly Benchmark[] => [
    ...placements.flatMap((placement): readonly Benchmark[] => [
        {
            name: `move ${placement.label}`,
            operation: "A kernel adding a vec3 to another for the rows with two tags: integration, animation, any per-row update.",
            per: "matched rows",
            n: 250_000,
            typical: [1_000, 1_000_000],
            best: { bytes: 36, basis: "Each row reads 12 bytes of velocity and reads and writes 12 bytes of position.", on: placement.on },
            run: () => measured(placement, async world => {
                await world.run(spawn, { count: 1_000_000 });
                return (await particlesFastest(() => world.run(move))).minimum;
            }),
        },
        {
            name: `follow ${placement.label}`,
            operation: "A kernel looking up another entity per row and reading its position: steering toward targets, constraints, attachments.",
            per: "rows",
            n: 1_000_000,
            typical: [1_000, 100_000],
            best: { bytes: 52, basis: "Each row reads 12 bytes of position and an 8-byte target, the target's 8-byte location and 12-byte position, and writes 12.", on: placement.on },
            run: () => measured(placement, async world => {
                await seeded(() => world, 1_000_000);
                return fastest(() => world.run(follow));
            }),
        },
        {
            name: `chain ${placement.label}`,
            operation: "Six dependent kernels over the same rows, each reading what the one before wrote: a pipeline of per-row steps.",
            per: "row passes",
            n: 6_000_000,
            typical: [6_000, 6_000_000],
            best: { bytes: 4, basis: "Fused into one pass, each row reads and writes its 12-byte velocity once for all six.", on: placement.on },
            run: () => measured(placement, async world => {
                await seeded(() => world, 1_000_000);
                return fastest(() => world.run(chain));
            }),
        },
        {
            name: `sparse changed ${placement.label}`,
            operation: "A kernel filtered on `changed` after 1% of rows changed, scattered: reacting to edits, such as recomputing bounds of what moved.",
            per: "rows in the archetype",
            n: 1_000_000,
            typical: [10_000, 1_000_000],
            best: { bytes: 8.24, basis: "Every chunk has a change, so each row's 8-byte tick is read; the changed 1% read 12 bytes and write 12.", on: placement.on },
            run: () => measured(placement, async world => {
                await seeded(() => world, 1_000_000);
                let frame = 0;
                let best = Infinity;
                for (let i = 0; i < 200; i++) {
                    await world.run(poke, { group: frame++ % 100 });
                    const start = performance.now();
                    await world.run(observe);
                    if (i >= 20) best = Math.min(best, performance.now() - start);
                }
                return best;
            }),
        },
        {
            name: `spawn bulk kernel ${placement.label}`,
            operation: "A kernel spawning an entity per row over 100K rows: spawns found by a parallel pass, such as debris or hits.",
            per: "spawns",
            n: 100_000,
            typical: [100, 100_000],
            best: { bytes: 28, basis: "Each row reads its 4-byte index; each spawn writes its 8 bytes of values, its entity and its location.", on: placement.on },
            run: () => measured(placement, async world => {
                await world.run(structural.seed, { count: 100_000, sources: 1 });
                let best = Infinity;
                for (let i = 0; i < 40; i++) {
                    await world.run(structural.despawnSpawned);
                    const start = performance.now();
                    await world.run(structural.spawnKernel);
                    if (i >= 8) best = Math.min(best, performance.now() - start);
                }
                return best;
            }),
        },
        ...[[100_000, 10, "100K chains of 10"], [1_000, 1_000, "1K chains of 1,000"]].map(([roots, depth, chains]): Benchmark => ({
            name: `up depth ${depth} ${placement.label}`,
            operation: upOperation(String(chains)),
            per: "rows",
            n: 1_000_000,
            typical: [1_000, 100_000],
            best: { ...upBest, on: placement.on },
            run: () => measured(placement, async world => {
                await world.run(forest, { roots: Number(roots), depth: Number(depth) });
                return fastest(() => world.run(propagate));
            }),
        })),
    ]),
    ...placements.map((placement): Benchmark => ({
        name: `sync point grow 100 archetypes ${placement.label}`,
        operation: placement.workers === 0
            ? "A sync point where each of 100 archetypes grows, by one spawn into each: levels and bursts filling many kinds of entities at once."
            : "A sync point where each of 100 archetypes grows, by one spawn into each, then a kernel over them, so workers take up the new layout.",
        per: "archetypes grown",
        n: 100,
        typical: [1, 100],
        best: { bytes: 64, basis: "Each archetype that grows writes at least its layout record, a cache line.", on: placement.on },
        run: async () => {
            let best = Infinity;
            for (let round = 0; round < rounds; round++) {
                const world = createWorld({ [workers]: placement.workers }, { minimumChunk: 16 });
                try {
                    // Registers both systems and loads the kernel; then every archetype holds one row of its 16.
                    await world.run(spawnEach);
                    await world.run(bumpEach);
                    let count = 1;
                    for (let capacity = 16, d = 0; d < doublings; d++, capacity *= 2) {
                        await world.run(fillEach, { count: capacity - count });
                        const start = performance.now();
                        await world.run(spawnEach);
                        if (placement.workers > 0) await world.run(bumpEach);
                        best = Math.min(best, performance.now() - start);
                        count = capacity + 1;
                    }
                } finally {
                    await world.dispose();
                }
            }
            return best;
        },
    })),
];
