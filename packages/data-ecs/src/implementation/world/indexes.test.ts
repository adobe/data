import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { Index } from "../../interface/indexes/index-type.js";
import { Observe } from "../../interface/observe/observe.js";
import { always } from "../../interface/resources/always.js";
import { clock } from "../../interface/resources/clock.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld, type CreatedWorld } from "./create.js";
import { tablesAfterCollecting } from "./lifetime.test-helper.js";
import { backToBack } from "./loop.js";

const cell = Symbol("indexesTest/cell");
const weight = Symbol("indexesTest/weight");
const label = Symbol("indexesTest/label");
const serverId = Symbol("indexesTest/serverId");
const owner = Symbol("indexesTest/owner");
const hidden = Symbol("indexesTest/hidden");
const order = Symbol("indexesTest/order");

declare module "@adobe/data-ecs" {
    interface Components {
        [cell]: { type: readonly [number, number] };
        [weight]: { type: number };
        [label]: { type: string };
        [serverId]: { type: number };
        [owner]: { type: Entity; reference: "weak" };
        [hidden]: { type: true };
        [order]: { type: number };
    }
}

Component.register(cell, { type: { type: "array", items: { type: "integer", minimum: -1000, maximum: 1000 }, minItems: 2, maxItems: 2 } });
Component.register(weight, { type: { type: "number" } });
Component.register(label, { type: { type: "string" } });
Component.register(serverId, { type: { type: "integer", minimum: 0, maximum: 1000000 } });
Component.register(owner, { type: Entity.schema, reference: "weak" });
Component.register(hidden, { type: { const: true } });
Component.register(order, { type: { type: "number" } });

const grid = Index.create({ name: "indexesTest/grid", key: [cell], components: { has: [weight], not: [hidden] } });
const byServerId = Index.create({ name: "indexesTest/byServerId", key: [serverId], unique: true });
const byLabel = Index.create({ name: "indexesTest/byLabel", key: [label] });
const children = Index.create({ name: "indexesTest/children", key: [owner] });

const spawnCells = System.create({ name: "indexesTest/spawnCells", input: { type: "object", properties: { cells: { type: "array", items: { type: "array", items: { type: "integer" } } } } } }, ({ input, commands }) => {
    input.cells.forEach(([x, y], k) => commands.spawn([cell, weight])({ [cell]: [x ?? 0, y ?? 0], [weight]: k }));
});

/** What a lookup of cell `at` holds, as entities and weights, in its order, and whether it changed. */
let seen: { readonly entities: readonly Entity[]; readonly weights: readonly number[]; readonly changed: boolean; readonly length: number } | null = null;

const look = System.create({
    name: "indexesTest/look",
    input: { type: "object", properties: { x: { type: "integer" }, y: { type: "integer" } } },
    lookup: { near: { index: grid, read: [weight] } },
}, ({ input, lookup }) => {
    const near = lookup.near([input.x, input.y]);
    const entities: Entity[] = [];
    const weights: number[] = [];
    for (let i = 0; i < near.length; i++) {
        entities.push(near.at(i).entity);
        weights.push(near.at(i)[weight]);
    }
    seen = { entities, weights, changed: near.changed, length: near.length };
});

/** Moves every entity in cell [0, 0] to [1, 0], before `lookAfter` in the same run. */
const shift = System.create({ name: "indexesTest/shift", components: { write: [cell] } }, row => {
    if (row[cell][0] === 0 && row[cell][1] === 0) row[cell] = [1, 0];
});
let afterShift: number | null = null;
const lookAfter = System.create({ name: "indexesTest/lookAfter", lookup: { near: { index: grid } }, after: [shift] }, ({ lookup }) => {
    afterShift = lookup.near([1, 0]).length;
});
const shiftThenLook = System.create({ name: "indexesTest/shiftThenLook", systems: [shift, lookAfter] });

const entitiesOf = (world: CreatedWorld): Promise<readonly Entity[]> => Observe.toPromise(world.observe.select({ required: [cell] }));

describe("hash indexes on the main thread", () => {
    it("find a bucket's rows by key, in entity order, and nothing for a key no entity has", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawnCells, { cells: [[0, 0], [1, 1], [0, 0], [2, 2], [0, 0]] });
        const all = await entitiesOf(world);
        await world.run(look, { x: 0, y: 0 });
        expect(seen?.entities).toEqual([all[0], all[2], all[4]]);
        expect(seen?.weights).toEqual([0, 2, 4]);
        await world.run(look, { x: 5, y: 5 });
        expect(seen?.length).toBe(0);
    });
    it("see keys written by systems ordered before them in the same run", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawnCells, { cells: [[0, 0], [0, 0], [1, 0]] });
        await world.run(shiftThenLook);
        expect(afterShift).toBe(3);
        await world.run(look, { x: 0, y: 0 });
        expect(seen?.length).toBe(0);
    });
    it("follow spawns, despawns and archetype moves at sync points, and hold only entities of their components", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawnCells, { cells: [[0, 0], [0, 0], [0, 0]] });
        const [a, b, c] = await entitiesOf(world);
        await world.run(System.create(({ commands }) => {
            commands.despawn(a);
            commands.add(b, hidden);
            commands.spawn([cell, weight])({ [cell]: [0, 0], [weight]: 9 });
            commands.spawn([cell])({ [cell]: [0, 0] });
        }));
        await world.run(look, { x: 0, y: 0 });
        expect(seen?.weights).toEqual([2, 9]);
        expect(seen?.entities[0]).toBe(c);
        await world.run(System.create(({ commands }) => { commands.remove(b, hidden); }));
        await world.run(look, { x: 0, y: 0 });
        expect(seen?.weights).toEqual([1, 2, 9]);
    });
    it("report changed only when an entity entered, left or moved in the list since the system last ran", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawnCells, { cells: [[0, 0], [0, 0], [1, 1]] });
        await world.run(look, { x: 0, y: 0 });
        expect(seen?.changed).toBe(true);
        await world.run(look, { x: 0, y: 0 });
        expect(seen?.changed).toBe(false);
        // Another bucket changing isn't this one changing, and a list compares with the system's last run, whatever it looked up then.
        const [, , third] = await entitiesOf(world);
        await world.run(System.create(({ commands }) => { commands.add(third, cell, [2, 2]); }));
        await world.run(look, { x: 0, y: 0 });
        expect(seen?.changed).toBe(false);
        await world.run(look, { x: 2, y: 2 });
        expect(seen).toMatchObject({ changed: false, length: 1 });
        await world.run(System.create(({ commands }) => { commands.add(third, cell, [0, 0]); }));
        await world.run(look, { x: 2, y: 2 });
        expect(seen).toMatchObject({ changed: true, length: 0 });
        await world.run(System.create(({ commands }) => { commands.add(third, cell, [5, 5]); }));
        await world.run(look, { x: 0, y: 0 });
        expect(seen).toMatchObject({ changed: true, length: 2 });
    });
    it("key strings by value, and entities by their generation too", async () => {
        await using world = createWorld({ [workers]: 0 });
        let found: readonly number[] = [];
        const named = System.create({ input: { type: "object", properties: { name: { type: "string" } } }, lookup: { named: { index: byLabel } } }, ({ input, lookup }) => {
            const list = lookup.named(input.name);
            found = Array.from({ length: list.length }, (_, i) => list.at(i).entity);
        });
        await world.run(System.create(({ commands }) => {
            commands.spawn([label])({ [label]: "a" });
            commands.spawn([label])({ [label]: "b" });
            commands.spawn([label])({ [label]: "a" });
        }));
        const labeled = await Observe.toPromise(world.observe.select({ required: [label] }));
        await world.run(named, { name: "a" });
        expect(found).toEqual([labeled[0], labeled[2]]);
        await world.run(named, { name: "c" });
        expect(found).toEqual([]);
        const parent = labeled[1];
        let held: readonly Entity[] = [];
        const kids = System.create({ input: { type: "object", properties: { of: { type: "number" } } }, lookup: { of: { index: children } } }, ({ input, lookup }) => {
            const list = lookup.of(Entity.none);
            void list;
            const of = lookup.of(input.of === 0 ? parent : Entity.none);
            held = Array.from({ length: of.length }, (_, i) => of.at(i).entity);
        });
        await world.run(System.create(({ commands }) => {
            commands.spawn([owner])({ [owner]: parent });
            commands.spawn([owner])({ [owner]: parent });
        }));
        await world.run(kids, { of: 0 });
        expect(held).toHaveLength(2);
        await world.run(System.create(({ commands }) => { commands.despawn(parent); }));
        await world.run(kids, { of: 0 });
        expect(held).toEqual([]);
    });
});

describe("unique indexes", () => {
    let known: Entity | null = null;
    const find = System.create({ input: { type: "object", properties: { id: { type: "integer" } } }, lookup: { known: { index: byServerId } } }, ({ input, lookup }) => {
        known = lookup.known(input.id)?.entity ?? null;
    });
    it("give the row of a key or null, and report two entities with one key as an index failure, keeping the lower", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(System.create(({ commands }) => {
            commands.spawn([serverId])({ [serverId]: 7 });
            commands.spawn([serverId])({ [serverId]: 8 });
        }));
        const [first, second] = await Observe.toPromise(world.observe.select({ required: [serverId] }));
        const report = await world.run(find, { id: 7 });
        expect(report.failures).toEqual([]);
        expect(known).toBe(first);
        await world.run(find, { id: 9 });
        expect(known).toBe(null);
        await world.run(System.create(({ commands }) => { commands.add(second, serverId, 7); }));
        const conflicted = await world.run(find, { id: 7 });
        expect(known).toBe(first);
        expect(conflicted.failures).toEqual([{
            kind: "index",
            name: "indexesTest/byServerId",
            message: `Index "indexesTest/byServerId" is unique, and entities ${first} and ${second} both have key 7; lookups give ${first}, the one with the lower entity index.`,
            stack: null,
        }]);
        // Found once: the next run reports nothing.
        expect((await world.run(find, { id: 7 })).failures).toEqual([]);
    });
});

describe("call sites", () => {
    it("keep their own lists, valid until they run again, and rows distinct by position", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawnCells, { cells: [[0, 0], [0, 0], [1, 1]] });
        let pairs: number[] = [];
        const both = System.create({ lookup: { near: { index: grid, read: [weight] } } }, ({ lookup }) => {
            const a = lookup.near([0, 0]);
            const b = lookup.near([1, 1]);
            pairs = [a.length, b.length, a.at(0)[weight] + a.at(1)[weight], b.at(0)[weight]];
        });
        await world.run(both);
        expect(pairs).toEqual([2, 1, 1, 2]);
    });
    it("work as written where the plugin didn't rewrite them, making a new list each call", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawnCells, { cells: [[0, 0], [0, 0]] });
        let lengths: number[] = [];
        const written = System.create({ lookup: { near: { index: grid } } }, context => {
            const near = context.lookup.near;
            const first = near([0, 0]);
            const second = near([1, 1]);
            lengths = [first.length, second.length];
        });
        await world.run(written);
        expect(lengths).toEqual([2, 0]);
    });
});

describe("finalizers", () => {
    const released: number[] = [];
    Finalizer.create({ name: "indexesTest/release", components: { read: [order, cell] }, lookup: { near: { index: grid, read: [weight] } } }, (row, { lookup }) => {
        released.push(lookup.near(row[cell]).length);
    });
    it("look up through indexes as they are before the sync point applies", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(System.create(({ commands }) => {
            commands.spawn([cell, weight])({ [cell]: [3, 3], [weight]: 1 });
            commands.spawn([cell, weight, order])({ [cell]: [3, 3], [weight]: 2, [order]: 0 });
        }));
        const [, ordered] = await entitiesOf(world);
        await world.run(System.create(({ commands }) => {
            commands.despawn(ordered);
            commands.spawn([cell, weight])({ [cell]: [3, 3], [weight]: 3 });
        }));
        expect(released).toEqual([2]);
    });
});

const keepTicking = System.create({ name: "indexesTest/keepTicking" }, () => {});
/** Uses `grid` every tick it's added to. */
const watchGrid = System.create({ name: "indexesTest/watchGrid", lookup: { near: { index: grid } } }, ({ lookup }) => { void lookup.near([0, 0]).length; });

describe("index lifetime", () => {
    it("builds an index the first time a system uses it and releases it, arena blocks included, once none does", async () => {
        const driver = backToBack();
        await using world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
        await world.run(spawnCells, { cells: [[0, 0], [1, 1]] });
        // Ticks of what an index is keyed by stay once started, as any component's do.
        await world.run(System.create({ components: { read: [cell], changed: [cell] } }, row => { void row[cell]; }));
        const before = await tablesAfterCollecting(world);
        // A system made for one run is collected, and its index with it.
        await world.run(System.create({ lookup: { near: { index: grid } } }, ({ lookup }) => { void lookup.near([0, 0]).length; }));
        expect(await tablesAfterCollecting(world)).toEqual(before);
        // A removed one forgets it.
        const ticks = async (count: number): Promise<void> => {
            const first = (await Observe.toPromise(world.observe.resource(clock))).tick;
            await new Promise<void>(resolve => {
                const stop = world.observe.resource(clock)(({ tick }) => {
                    if (tick < first + count) return;
                    queueMicrotask(() => stop());
                    resolve();
                });
            });
        };
        // Ticks run only while a system is added.
        world.add(keepTicking);
        world.add(watchGrid);
        await ticks(2);
        expect((await world.tables()).indexes).toBe(before.indexes + 1);
        world.remove(watchGrid);
        await ticks(2);
        const removed = await tablesAfterCollecting(world);
        expect(removed.indexes).toBe(before.indexes);
        expect(removed.journalReaders).toBe(before.journalReaders);
        driver.close();
    });
});

/** A seeded generator of numbers in [0, 1), so a failing round replays. */
const random = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state ^ (state >>> 15), 0x2C1B3C6D) + 0x6D2B79F5) >>> 0;
        state ^= state >>> 12;
        return (state >>> 0) / 0x100000000;
    };
};

/** Every cell a property test's entities take. */
const cells: readonly (readonly [number, number])[] = Array.from({ length: 16 }, (_, k) => [k % 4, k >> 2]);

/** Each cell's entities, through `lookup`, which must be in entity order. */
const bucketsOf = (lookup: (key: readonly [number, number]) => { readonly length: number; at(index: number): { readonly entity: Entity } }): readonly (readonly number[])[] =>
    cells.map(key => {
        const list = lookup(key);
        return Array.from({ length: list.length }, (_, i) => list.at(i).entity);
    });

const isOrdered = (bucket: readonly number[]): boolean => bucket.every((entity, k) => k === 0 || (bucket[k - 1] >>> 0) < (entity >>> 0));

let incremental: readonly (readonly number[])[] = [];
const probe = System.create({ name: "indexesTest/probe", lookup: { near: { index: grid } } }, ({ lookup }) => { incremental = bucketsOf(key => lookup.near(key)); });

/** Moves each row whose weight is below `share` of 1000 to the cell `cell` gives it, so keys change during runs. */
const rekey = System.create({
    name: "indexesTest/rekey", input: { type: "object", properties: { share: { type: "number" }, seed: { type: "integer" } } },
    components: { read: [weight], write: [cell] }, before: [probe],
}, (row, { input }) => {
    if ((row[weight] * 7919 + input.seed) % 1000 < input.share * 1000) row[cell] = cells[(row[weight] + input.seed) % cells.length];
});

describe("an incrementally refreshed hash index", () => {
    it("equals one built from scratch after random spawns, despawns, moves and key writes, its buckets in entity order", async () => {
        await using world = createWorld({ [workers]: 0 });
        const next = random(12345);
        const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(next() * list.length)];
        let held = 0;
        for (let step = 0; step < 80; step++) {
            const living = await Observe.toPromise(world.observe.select({ required: [cell] }));
            const operations = Math.floor(next() * 40);
            const plan: (readonly [string, Entity | undefined, number])[] = [];
            for (let k = 0; k < operations; k++) plan.push([pick(["spawn", "spawn", "despawn", "hide", "show", "weigh", "unweigh", "set"]) ?? "spawn", pick(living), Math.floor(next() * 1000)]);
            await world.run(System.create(({ commands }) => {
                for (const [operation, entity, value] of plan) {
                    if (operation === "spawn") commands.spawn([cell, weight])({ [cell]: cells[value % cells.length], [weight]: value });
                    else if (entity === undefined) continue;
                    else if (operation === "despawn") commands.despawn(entity);
                    else if (operation === "hide") commands.add(entity, hidden);
                    else if (operation === "show") commands.remove(entity, hidden);
                    else if (operation === "weigh") commands.add(entity, weight, value);
                    else if (operation === "unweigh") commands.remove(entity, weight);
                    else commands.add(entity, cell, cells[value % cells.length]);
                }
            }));
            // Now and then most rows' keys change, past what a patch takes.
            await world.run(System.create({ systems: [rekey, probe] }), { share: next() < 0.1 ? 0.9 : 0.05, seed: step });
            const scratch = Index.create({ key: [cell], components: { has: [weight], not: [hidden] } });
            let rebuilt: readonly (readonly number[])[] = [];
            await world.run(System.create({ lookup: { near: { index: scratch } } }, ({ lookup }) => { rebuilt = bucketsOf(key => lookup.near(key)); }));
            expect(incremental).toEqual(rebuilt);
            expect(incremental.every(isOrdered)).toBe(true);
            held = Math.max(held, incremental.reduce((sum, bucket) => sum + bucket.length, 0));
        }
        expect(held).toBeGreaterThan(100);
    });
});
