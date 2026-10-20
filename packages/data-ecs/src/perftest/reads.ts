import { Component } from "../interface/component/component.js";
import type { Entity } from "../interface/entity/entity.js";
import { toPromise } from "../interface/observe/to-promise.js";
import { Resource } from "../interface/resource/resource.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";
import { createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";
import { fastest } from "./suite.js";

// Benchmarks of reading a world from outside it: observers, and runs of systems that copy values out.

const level = Symbol("reads/level");
const value = Symbol("reads/value");
const rank = Symbol("reads/rank");
const marked = Symbol("reads/marked");
const unmatched = Symbol("reads/unmatched");
declare module "@adobe/data-ecs" {
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
const seed = System.create({ name: "reads/seed", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    commands.spawn([value, rank, marked])({ [value]: 0, [rank]: 0, [marked]: true });
    for (let i = 1; i < input.count; i++) commands.spawn([value, rank])({ [value]: (i * 7919) % input.count, [rank]: i });
});

/** Writes the marked entity's value, so one entity observer is notified and an ordered selection is a candidate. */
const nudge = System.create({ name: "reads/nudge", components: { has: [marked], write: [value] } }, row => { row[value] += 1; });

/** A kernel writing every row's rank, whose stamps it keeps only while something watches ranks change. */
const advance = System.create({ name: "reads/advance", kernel: "cpu", components: { write: [rank] } }, row => { row[rank] += 1; });

/** A system no entity matches: a run that changes nothing. */
const idle = System.create({ name: "reads/idle", components: { has: [unmatched] } }, () => {});

/** The entities `look` and `lookChanged` look up, each run. */
let looked: readonly Entity[] = [];
let found = 0;

/** Looks up every entity of `looked` by entity, reading its value, after `nudge` where both run. */
const look = System.create({ name: "reads/look", lookup: { values: { read: [value] } }, after: [nudge] }, ({ lookup }) => {
    for (let i = 0; i < looked.length; i++) {
        const row = lookup.values(looked[i]);
        if (row !== null && row[value] >= 0) found++;
    }
});

/** The same, with `changed`: counts the entities whose value may have changed since it last ran. */
const lookChanged = System.create({ name: "reads/lookChanged", lookup: { values: { read: [value], changed: [value] } }, after: [nudge] }, ({ lookup }) => {
    for (let i = 0; i < looked.length; i++) {
        const row = lookup.values(looked[i]);
        if (row !== null && row[value] >= 0 && row.changed) found++;
    }
});

const nudgeThenLook = System.create({ name: "reads/nudgeThenLook", systems: [nudge, look] });
const nudgeThenLookChanged = System.create({ name: "reads/nudgeThenLookChanged", systems: [nudge, lookChanged] });

/** A run of `system` over a world of `observedEntities` entities `looked` names, `found` after the last. */
const lookups = async (system: System): Promise<{ readonly best: number; readonly found: number }> => {
    const world = await seeded(observedEntities);
    looked = await entitiesOf(world);
    await world.run(system);
    found = 0;
    const best = await fastest(() => world.run(system));
    found = 0;
    await world.run(system);
    const result = { best, found };
    looked = [];
    await world.dispose();
    return result;
};

/** Every entity a seeded world holds. */
const entitiesOf = (world: World): Promise<readonly Entity[]> => toPromise(world.observe.select({ required: [value] }));

const seeded = async (count: number): Promise<World> => {
    const world = createWorld({ [workers]: 0 });
    await world.run(seed, { count });
    return world;
};

/** Observers in `observe 1K entities`, and entities `select page 100K` selects from. */
const observedEntities = 1_000;
const selectedRows = 100_000;

let copied = 0;

/** A world with an entity observer of each of its entities. */
const observedWorld = async (): Promise<{ readonly world: World; readonly stop: () => void; readonly notified: () => number }> => {
    const world = await seeded(observedEntities);
    let notified = 0;
    const stops = (await entitiesOf(world)).map(entity => world.observe.entity(entity, { required: [value] })(() => { notified++; }));
    return { world, stop: () => { for (const stop of stops) stop(); }, notified: () => notified };
};

const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
};

export const readBenchmarks: readonly Benchmark[] = [
    {
        name: "read observe",
        operation: "Reading a resource through an observer's first value, `Observe.toPromise(world.observe.resource(key))`: a value read from outside the world.",
        per: "reads",
        n: 1,
        typical: [1, 100],
        best: { bytes: 64, basis: "A read loads at least one cache line of the resource's cell." },
        run: async () => {
            const world = await seeded(10_000);
            const best = await fastest(async () => { copied = await toPromise(world.observe.resource(level)); });
            check(copied === 3, "read observe: wrong value");
            await world.dispose();
            return best;
        },
    },
    {
        name: "read run",
        operation: "Reading a resource through a run of a new system that copies it out: a value read from outside the world through a system made for the read.",
        per: "reads",
        n: 1,
        typical: [1, 100],
        best: { bytes: 64, basis: "A read loads at least one cache line of the resource's cell." },
        run: async () => {
            const world = await seeded(10_000);
            copied = 0;
            const best = await fastest(() => world.run(System.create({ resources: { read: [level] } }, ({ resources }) => { copied = resources[level]; })), 300);
            check(copied === 3, "read run: wrong value");
            await world.dispose();
            return best;
        },
    },
    {
        name: "read run synced",
        operation: "Reading a resource through a run of a new synced system that copies it out, which has no tiers and an empty sync point: as `read run`, through a synced system.",
        per: "reads",
        n: 1,
        typical: [1, 100],
        best: { bytes: 64, basis: "A read loads at least one cache line of the resource's cell." },
        run: async () => {
            const world = await seeded(10_000);
            copied = 0;
            const best = await fastest(() => world.run(System.create({ synced: true, resources: { read: [level] } }, ({ resources }) => { copied = resources[level]; })), 300);
            check(copied === 3, "read run synced: wrong value");
            await world.dispose();
            return best;
        },
    },
    {
        name: "read run changed",
        operation: "Reading the ranks that changed through a run of a new system filtering on `changed`, with a kernel writing them: a read whose filter turns the kernel's stamps on while the system lives.",
        per: "reads",
        n: 1,
        typical: [1, 100],
        best: { bytes: 64, basis: "A read loads at least one cache line of a chunk's tick." },
        run: async () => {
            // Few rows, since a new system's first run reads every row.
            const world = await seeded(100);
            await world.run(advance);
            copied = 0;
            const best = await fastest(async () => {
                await world.run(System.create({ components: { read: [rank], changed: [rank] } }, row => { copied += row[rank]; }));
            }, 300);
            check(copied > 0, "read run changed: nothing read");
            await world.dispose();
            return best;
        },
    },
    {
        name: "observe 1K entities",
        operation: "A run that changes nothing with an entity observer on each of 1K entities: what watching entities costs each frame.",
        per: "observers",
        n: observedEntities,
        typical: [10, 1_000],
        best: { bytes: 16, basis: "Each observer reads its entity's 8-byte location and its component's 8-byte changed tick." },
        run: async () => {
            const { world, stop, notified } = await observedWorld();
            const before = notified();
            const best = await fastest(() => world.run(idle));
            check(notified() === before, "observe 1K entities: notified");
            stop();
            await world.dispose();
            return best;
        },
    },
    {
        name: "observe 1K entities one changed",
        operation: "A run that changes one of 1K entities, each with an entity observer: what watching entities costs each frame while one of them changes.",
        per: "observers",
        n: observedEntities,
        typical: [10, 1_000],
        best: { bytes: 16, basis: "Each observer reads its entity's 8-byte location and its component's 8-byte changed tick." },
        run: async () => {
            const { world, stop, notified } = await observedWorld();
            const before = notified();
            const best = await fastest(() => world.run(nudge));
            check(notified() > before, "observe 1K entities one changed: not notified");
            stop();
            await world.dispose();
            return best;
        },
    },
    {
        name: "lookup 1K entities",
        operation: "A system looking up 1K entities by entity, reading a value of each, with nothing changed: following references, without `changed`.",
        per: "lookups",
        n: observedEntities,
        typical: [10, 1_000],
        best: { bytes: 16, basis: "Each lookup reads its entity's 8-byte location and its 8-byte value." },
        run: async () => {
            const { best, found } = await lookups(look);
            check(found === observedEntities, "lookup 1K entities: wrong count");
            return best;
        },
    },
    {
        name: "lookup 1K entities changed",
        operation: "The same with `changed`, with nothing changed: watching entities a system follows for changes since it last ran.",
        per: "lookups",
        n: observedEntities,
        typical: [10, 1_000],
        best: { bytes: 24, basis: "Each lookup reads its entity's 8-byte location, its 8-byte value and its 8-byte changed tick." },
        run: async () => {
            const { best, found } = await lookups(lookChanged);
            check(found === 0, "lookup 1K entities changed: changed");
            return best;
        },
    },
    {
        name: "lookup 1K entities one changed",
        operation: "A run writing one of 1K entities, then a system looking up each by entity, reading its value, without `changed`.",
        per: "lookups",
        n: observedEntities,
        typical: [10, 1_000],
        best: { bytes: 16, basis: "Each lookup reads its entity's 8-byte location and its 8-byte value." },
        run: async () => {
            const { best, found } = await lookups(nudgeThenLook);
            check(found === observedEntities, "lookup 1K entities one changed: wrong count");
            return best;
        },
    },
    {
        name: "lookup 1K entities changed one changed",
        operation: "The same with `changed`: one of the entities a system follows changed since it last ran.",
        per: "lookups",
        n: observedEntities,
        typical: [10, 1_000],
        best: { bytes: 24, basis: "Each lookup reads its entity's 8-byte location, its 8-byte value and its 8-byte changed tick." },
        run: async () => {
            const { best, found } = await lookups(nudgeThenLookChanged);
            check(found === 1, "lookup 1K entities changed one changed: wrong count");
            return best;
        },
    },
    {
        name: "select page 100K",
        operation: "A run that changes one entity's order component under a `select` observer with `where`, `order` and a 20-row `page` over 100K entities: a sorted, filtered list of a UI, recomputed after a change.",
        per: "rows",
        n: selectedRows,
        typical: [1_000, 100_000],
        best: { bytes: 16, basis: "Each row reads its 8-byte rank and its 8-byte value." },
        run: async () => {
            const world = await seeded(selectedRows);
            let page: readonly Entity[] = [];
            const stop = world.observe.select({ required: [value, rank], where: { [rank]: { "<": selectedRows / 2 } }, order: { [value]: false }, page: { offset: 100, limit: 20 } })(selected => { page = selected; });
            const best = await fastest(() => world.run(nudge));
            check(page.length === 20, "select page 100K: wrong page");
            stop();
            await world.dispose();
            return best;
        },
    },
];
