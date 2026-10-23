// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from "../interface/component/component.js";
import type { Entity } from "../interface/entity/entity.js";
import { Resource } from "../interface/resource/resource.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";
import { createWorld } from "../implementation/index.js";
import { Observe } from "../observe/index.js";
import type { Benchmark } from "./benchmark.js";
import { fastest } from "./suite.js";

// Benchmarks of the internal observer factories of `src/observe`.

const level = Symbol("observed/level");
const value = Symbol("observed/value");
const rank = Symbol("observed/rank");
const marked = Symbol("observed/marked");
const unmatched = Symbol("observed/unmatched");
declare module "@adobe/ecs" {
    export interface Components {
        [value]: { type: number };
        [rank]: { type: number };
        [marked]: { type: true };
        [unmatched]: { type: true };
    }
    export interface Resources {
        [level]: { type: number };
    }
}
Resource.register(level, { type: { type: "number", default: 3 } });
Component.register(value, { type: { type: "number" } });
Component.register(rank, { type: { type: "number" } });
Component.register(marked, { type: { const: true } });
Component.register(unmatched, { type: { const: true } });

/** `count` entities with a value and a rank, the first of them marked. */
const seed = System.create({ name: "observed/seed" }, ({ commands }, input: { readonly count: number }) => {
    commands.spawn([value, rank, marked])({ [value]: 0, [rank]: 0, [marked]: true });
    for (let i = 1; i < input.count; i++) commands.spawn([value, rank])({ [value]: (i * 7919) % input.count, [rank]: i });
});

/** Writes the marked entity's value, so one entity observer is notified and a selection or count is a candidate. */
const nudge = System.create({ name: "observed/nudge", components: { has: [marked], write: [value] } }, row => { row[value] += 1; });

/** A kernel writing every row's rank. */
const advance = System.create({ name: "observed/advance", kernel: "cpu", components: { write: [rank] } }, row => { row[rank] += 1; });

/** A system no entity matches: a run that changes nothing. */
const idle = System.create({ name: "observed/idle", components: { has: [unmatched] } }, () => {});

const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
};

/** Resolves once observers subscribed before it had their first values: a run after the factories flush. */
const settled = async (world: World): Promise<void> => {
    await Promise.resolve();
    await world.run(idle);
};

const seeded = async (count: number): Promise<World> => {
    const world = createWorld({ [workers]: 0 });
    await world.run(seed, { count });
    return world;
};

/** Every entity a seeded world holds. */
const entitiesOf = (world: World): Promise<readonly Entity[]> => Observe.toPromise(Observe.select(world, { required: [value] }));

/** As `fastest`: the fastest timed run of `run` within `budget` milliseconds of them, each after an untimed `prepare`. */
const fastestPrepared = async (prepare: () => Promise<unknown>, run: () => Promise<unknown>, budget = 1000): Promise<number> => {
    for (let warm = 0; warm < 10; warm++) {
        await prepare();
        await run();
    }
    let best = Infinity;
    let spent = 0;
    while (spent < budget) {
        await prepare();
        const start = performance.now();
        await run();
        const time = performance.now() - start;
        spent += time;
        best = Math.min(best, time);
    }
    return best;
};

type SelectQuery = Parameters<typeof Observe.select<readonly [typeof value, typeof rank]>>[1];

const observedEntities = 1_000;
const movingEntities = 100_000;
const selectedRows = 100_000;
const countedEntities = 1_000_000;

let copied = 0;

/** A world with an entity observer of each of its entities, which had its first value. */
const observedWorld = async (): Promise<{ readonly world: World; readonly stop: () => void; readonly notified: () => number }> => {
    const world = await seeded(observedEntities);
    let notified = 0;
    const stops = (await entitiesOf(world)).map(entity => Observe.entity(world, entity, { required: [value] })(() => { notified++; }));
    await settled(world);
    notified = 0;
    return { world, stop: () => { for (const stop of stops) stop(); }, notified: () => notified };
};

/** A page of `select page 100K` and `select page 100K churn`: a sorted, filtered list of a UI. */
const pageQuery = (offset: number): SelectQuery => ({ required: [value, rank], where: { [rank]: { "<": selectedRows / 2 } }, order: { [value]: false }, page: { offset, limit: 20 } });

export const observedBenchmarks: readonly Benchmark[] = [
    {
        name: "read observe factory warm",
        operation: "Reading a resource through an observer factory's first value, `Observe.toPromise(Observe.resource(world, key))`, while the factories hold its value: a value read from outside the world, again.",
        per: "reads",
        n: 1,
        typical: [1, 100],
        best: { bytes: 64, basis: "A read loads at least one cache line of the resource's cell." },
        run: async () => {
            const world = await seeded(10_000);
            const best = await fastest(async () => { copied = await Observe.toPromise(Observe.resource(world, level)); });
            check(copied === 3, "read observe factory warm: wrong value");
            await world.dispose();
            return best;
        },
    },
    {
        name: "read observe factory cold",
        operation: "Reading a resource through an observer factory's first value while the factories hold nothing of it, their observer system for it removed after idle passes: a run of observer systems for one read.",
        per: "reads",
        n: 1,
        typical: [1, 100],
        best: { bytes: 64, basis: "A read loads at least one cache line of the resource's cell." },
        run: async () => {
            const world = await seeded(10_000);
            const evict = async (): Promise<void> => {
                for (let i = 0; i < 3; i++) await world.run(idle);
            };
            const best = await fastestPrepared(evict, async () => { copied = await Observe.toPromise(Observe.resource(world, level)); });
            check(copied === 3, "read observe factory cold: wrong value");
            await world.dispose();
            return best;
        },
    },
    {
        name: "observe 1K entities factory",
        operation: "A run that changes nothing with an entity observer on each of 1K entities, through the observer factories: what watching entities costs each frame.",
        per: "observers",
        n: observedEntities,
        typical: [10, 1_000],
        best: { bytes: 16, basis: "Each observer reads its entity's 8-byte location and its component's 8-byte changed tick." },
        run: async () => {
            const { world, stop, notified } = await observedWorld();
            const best = await fastest(() => world.run(idle));
            check(notified() === 0, "observe 1K entities factory: notified");
            stop();
            await world.dispose();
            return best;
        },
    },
    {
        name: "observe 1K entities one changed factory",
        operation: "A run that changes one of 1K entities, each with an entity observer, through the observer factories: what watching entities costs each frame while one of them changes.",
        per: "observers",
        n: observedEntities,
        typical: [10, 1_000],
        best: { bytes: 16, basis: "Each observer reads its entity's 8-byte location and its component's 8-byte changed tick." },
        run: async () => {
            const { world, stop, notified } = await observedWorld();
            const best = await fastest(() => world.run(nudge));
            check(notified() > 0, "observe 1K entities one changed factory: not notified");
            stop();
            await world.dispose();
            return best;
        },
    },
    {
        name: "observe one entity among 100K moving factory",
        operation: "A kernel writing the rank of 100K entities, one of them observed, through the observer factories: a debugging view of one entity in a moving world, beyond the kernel's own time.",
        per: "runs",
        n: 1,
        typical: [1, 1],
        best: { bytes: 800_000, basis: "The kernel reads and writes 100K 4-byte ranks; observing one entity adds a cache line." },
        run: async () => {
            const world = await seeded(movingEntities);
            const [first] = await entitiesOf(world);
            let notified = 0;
            const stop = Observe.entity(world, first, { required: [rank] })(() => { notified++; });
            await world.run(advance);
            const before = notified;
            const best = await fastest(() => world.run(advance));
            check(notified > before, "observe one entity among 100K moving factory: not notified");
            stop();
            await world.dispose();
            return best;
        },
    },
    {
        name: "observe subscribe churn 1K factory",
        operation: "Subscribing an entity observer to each of 1K entities, a run, and stopping them all, through the observer factories: views opened and closed each frame.",
        per: "observers",
        n: observedEntities,
        typical: [10, 1_000],
        best: { bytes: 16, basis: "Each observer reads its entity's 8-byte location and its component's 8-byte value." },
        run: async () => {
            const world = await seeded(observedEntities);
            const entities = await entitiesOf(world);
            let notified = 0;
            const notify = (): void => { notified++; };
            const best = await fastest(async () => {
                const stops = entities.map(entity => Observe.entity(world, entity, { required: [value] })(notify));
                await world.run(idle);
                for (const stop of stops) stop();
            });
            check(notified > 0, "observe subscribe churn 1K factory: no first values");
            await world.dispose();
            return best;
        },
    },
    {
        name: "select page 100K factory",
        operation: "A run that changes one entity's order component under an observer factory's `select` with `where`, `order` and a 20-row `page` over 100K entities: a sorted, filtered list of a UI, kept current through a sorted index.",
        per: "rows",
        n: selectedRows,
        typical: [1_000, 100_000],
        best: { bytes: 16, basis: "Each row reads its 8-byte rank and its 8-byte value." },
        run: async () => {
            const world = await seeded(selectedRows);
            let page: readonly Entity[] = [];
            const stop = Observe.select(world, pageQuery(100))(selected => { page = selected; });
            await settled(world);
            const best = await fastest(() => world.run(nudge));
            check(page.length === 20, "select page 100K factory: wrong page");
            stop();
            await world.dispose();
            return best;
        },
    },
    {
        name: "select page 100K churn factory",
        operation: "The first value of a 20-row page of a `select` with `where` and `order` over 100K entities, at another offset each time, while another observer of that query keeps it current, through the observer factories: a UI paging.",
        per: "reads",
        n: 1,
        typical: [1, 100],
        best: { bytes: 320, basis: "A page reads 20 entries of 16 bytes: an entity, its rank and its value." },
        run: async () => {
            const world = await seeded(selectedRows);
            const stop = Observe.select(world, pageQuery(0))(() => {});
            await settled(world);
            let offset = 0;
            let page: readonly Entity[] = [];
            const best = await fastest(async () => {
                offset = (offset + 20) % 2_000;
                page = await Observe.toPromise(Observe.select(world, pageQuery(offset)));
            });
            check(page.length === 20, "select page 100K churn factory: wrong page");
            stop();
            await world.dispose();
            return best;
        },
    },
    {
        name: "select factory",
        operation: "The first value of an observer factory's `select` with `where` over 1M entities, which the factories hold nothing of: one scan, a run of an observer system over the rows that match.",
        per: "rows",
        n: 1_000_000,
        typical: [100, 100_000],
        best: { bytes: 8, basis: "Each row reads its 4-byte rank; each selected half writes its 8-byte entity." },
        run: async () => {
            const world = await seeded(1_000_000);
            const best = await fastest(async () => {
                const selected = await Observe.toPromise(Observe.select(world, { required: [value, rank], where: { [rank]: { "<": 500_000 } } }));
                check(selected.length === 500_000, "select factory: wrong count");
            });
            await world.dispose();
            return best;
        },
    },
    {
        name: "count 1M changed factory",
        operation: "A run that changes one entity's value under a `count` with `where` over 1M entities, through the observer factories: a filtered total of a UI, counted again after a change.",
        per: "rows",
        n: countedEntities,
        typical: [1_000, 1_000_000],
        best: { bytes: 8, basis: "Each row reads its 8-byte value." },
        run: async () => {
            const world = await seeded(countedEntities);
            let counted = 0;
            const stop = Observe.count(world, { required: [value], where: { [value]: { "<": countedEntities / 2 } } })(next => { counted = next; });
            await settled(world);
            const best = await fastest(() => world.run(nudge));
            check(counted > 0, "count 1M changed factory: nothing counted");
            stop();
            await world.dispose();
            return best;
        },
    },
];
