import { World } from "../world/world.js";
import { enabled as flatEnabled, spawnFlat, spawnFlatDynamic, visible as flatVisible } from "./flat.js";
import { enabled, fastest as particlesFastest, move, position as particlePosition, spawn, visible } from "./particles.js";
import { chain, churn, emit, fastest, follow, highest, hits, index, indexSum, observe, poke, pokeCluster, position, reduce, retag, seeded, smalls, tag, totalOf } from "./suite.js";

/** Benchmarks shared by vitest (`*.perf-test.ts`) and the bundled node runner (`run.ts`). Each resolves to milliseconds. */
export type Benchmark = { readonly name: string; readonly run: () => Promise<number> };

const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
};

/** The fastest run of `observe` right after `writer` changes rows. */
const observed = async (world: World, writer: typeof poke | typeof pokeCluster): Promise<number> => {
    let frame = 0;
    let best = Infinity;
    for (let i = 0; i < 60; i++) {
        await world.run(writer, frame++ % 100);
        const start = performance.now();
        await world.run(observe);
        if (i >= 10) best = Math.min(best, performance.now() - start);
    }
    return best;
};

export const benchmarks: readonly Benchmark[] = [
    {
        name: "create 1M",
        run: () => fastest(async () => {
            const world = World.create();
            await world.run(spawn, 1_000_000);
            await world.dispose();
        }, 5000, 2),
    },
    {
        name: "create flat 1M",
        run: () => fastest(async () => {
            const world = World.create();
            await world.run(spawnFlat, 1_000_000);
            check(world.query.count([flatVisible, flatEnabled]) === 250_000, "create flat: wrong count");
            await world.dispose();
        }, 5000, 2),
    },
    {
        name: "create flat dynamic 1M",
        run: () => fastest(async () => {
            const world = World.create();
            await world.run(spawnFlatDynamic, 1_000_000);
            check(world.query.count([flatVisible, flatEnabled]) === 250_000, "create flat dynamic: wrong count");
            await world.dispose();
        }, 5000, 2),
    },
    {
        name: "move 1M",
        run: async () => {
            const world = World.create();
            await world.run(spawn, 1_000_000);
            check(world.query.count([particlePosition, visible, enabled]) === 250_000, "move: wrong count");
            const { minimum } = await particlesFastest(() => world.run(move));
            await world.dispose();
            return minimum;
        },
    },
    {
        name: "churn 1M",
        run: async () => {
            const world = await seeded(() => World.create(), 1_000_000);
            let frame = 0;
            const best = await fastest(() => world.run(churn, frame++ % 10));
            check(world.query.count([index]) === 1_000_000, "churn: wrong count");
            await world.dispose();
            return best;
        },
    },
    {
        name: "retag 1M",
        run: async () => {
            const world = await seeded(() => World.create(), 1_000_000);
            let frame = 0;
            const best = await fastest(() => world.run(retag, frame++ % 10));
            check(world.query.count([tag]) > 0, "retag: no tags");
            await world.dispose();
            return best;
        },
    },
    {
        name: "sparse changed 1M",
        run: async () => {
            const world = await seeded(() => World.create(), 1_000_000);
            const best = await observed(world, poke);
            await world.dispose();
            return best;
        },
    },
    {
        name: "sparse changed clustered 1M",
        run: async () => {
            const world = await seeded(() => World.create(), 1_000_000);
            const best = await observed(world, pokeCluster);
            await world.dispose();
            return best;
        },
    },
    {
        name: "follow 1M",
        run: async () => {
            const world = await seeded(() => World.create(), 1_000_000);
            const best = await fastest(() => world.run(follow));
            await world.dispose();
            return best;
        },
    },
    {
        name: "emit 1M",
        run: async () => {
            const world = await seeded(() => World.create(), 1_000_000);
            const best = await fastest(() => world.run(emit));
            check(world.query.count([hits]) === 100_000, "emit: wrong count");
            await world.dispose();
            return best;
        },
    },
    {
        name: "reduce 1M",
        run: async () => {
            const world = await seeded(() => World.create(), 1_000_000);
            const best = await fastest(() => world.run(reduce));
            check(world.read.resource(highest) === 999_999 && world.read.resource(indexSum) === 999_999 * 500_000, "reduce: wrong fold");
            await world.dispose();
            return best;
        },
    },
    {
        name: "chain 6x1M",
        run: async () => {
            const world = await seeded(() => World.create(), 1_000_000);
            const best = await fastest(() => world.run(chain));
            await world.dispose();
            return best;
        },
    },
    {
        name: "main thread 50x1K",
        run: async () => {
            const world = await seeded(() => World.create(), 1_000);
            const best = await fastest(() => world.run(smalls));
            check(totalOf() > 0, "main thread: nothing read");
            await world.dispose();
            return best;
        },
    },
    {
        name: "select 1M",
        run: async () => {
            const world = await seeded(() => World.create(), 1_000_000);
            const best = await fastest(async () => {
                const selected = world.query.select([position, index], { where: { [index]: { "<": 500_000 } } });
                let sum = 0;
                for (const entity of selected) sum += world.read.component(entity, position)?.[0] ?? 0;
                check(sum > 0, "select: nothing read");
            });
            await world.dispose();
            return best;
        },
    },
];
