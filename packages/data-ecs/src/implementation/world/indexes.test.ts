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

/** Every cell a property test's entities take: sixteen, or two, so its buckets are long. */
const allCells: readonly (readonly [number, number])[] = Array.from({ length: 16 }, (_, k) => [k % 4, k >> 2]);
let cells: readonly (readonly [number, number])[] = allCells;

/** Each cell's entities, through `lookup`, which must be in entity order. */
const bucketsOf = (lookup: (key: readonly [number, number]) => { readonly length: number; at(index: number): { readonly entity: Entity } }): readonly (readonly number[])[] =>
    allCells.map(key => {
        const list = lookup(key);
        return Array.from({ length: list.length }, (_, i) => list.at(i).entity);
    });

const isOrdered = (bucket: readonly number[]): boolean => bucket.every((entity, k) => k === 0 || (bucket[k - 1] >>> 0) < (entity >>> 0));

let incremental: readonly (readonly number[])[] = [];
const probe = System.create({ name: "indexesTest/probe", lookup: { near: { index: grid } } }, ({ lookup }) => { incremental = bucketsOf(key => lookup.near(key)); });

const folded = Symbol("indexesTest/folded");
declare module "@adobe/data-ecs" {
    interface Components {
        [folded]: { type: number };
    }
}
Component.register(folded, { type: { type: "number" } });

/** A list's entities folded into one number, by position: what `foldNear` writes. */
const foldOf = (bucket: readonly number[]): number => bucket.reduce((sum, entity, i) => sum + (entity % 997) * (i + 1), 0);

/** A kernel folding the entities of its row's own cell's list, so kernels' lookups are checked against the same index. */
const foldNear = System.create({
    name: "indexesTest/foldNear", kernel: "cpu",
    components: { read: [cell], write: [folded] },
    lookup: { near: { index: grid } },
}, (row, { lookup }) => {
    const [x, y] = row[cell];
    const near = lookup.near([x, y]);
    let sum = 0;
    for (let i = 0; i < near.length; i++) sum += (near.at(i).entity % 997) * (i + 1);
    row[folded] = sum;
});

/** Moves each row whose weight is below `share` of 1000 to the cell `cell` gives it, so keys change during runs. */
const rekey = System.create({
    name: "indexesTest/rekey", input: { type: "object", properties: { share: { type: "number" }, seed: { type: "integer" } } },
    components: { read: [weight], write: [cell] }, before: [probe],
}, (row, { input }) => {
    if ((row[weight] * 7919 + input.seed) % 1000 < input.share * 1000) row[cell] = cells[(row[weight] + input.seed) % cells.length];
});

describe("an incrementally refreshed hash index", () => {
    it.each([[16, 12345, true], [2, 678, false]])("equals one built from scratch after random spawns, despawns, moves and key writes, its buckets in entity order, as kernels read it too, over %i cells, WASM %s", async (cellCount, seed, wasm) => {
        cells = allCells.slice(0, cellCount);
        await using world = createWorld({ [workers]: 0 }, { wasm });
        const next = random(seed);
        const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(next() * list.length)];
        let held = 0;
        for (let step = 0; step < 80; step++) {
            const living = await Observe.toPromise(world.observe.select({ required: [cell] }));
            const operations = Math.floor(next() * 60);
            const plan: (readonly [string, Entity | undefined, number])[] = [];
            for (let k = 0; k < operations; k++) plan.push([pick(["spawn", "spawn", "spawn", "spawn", "despawn", "hide", "show", "weigh", "unweigh", "set"]) ?? "spawn", pick(living), Math.floor(next() * 1000)]);
            await world.run(System.create(({ commands }) => {
                for (const [operation, entity, value] of plan) {
                    if (operation === "spawn") commands.spawn([cell, weight, folded])({ [cell]: cells[value % cells.length], [weight]: value, [folded]: 0 });
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
            await world.run(foldNear);
            const rows = await Observe.toPromise(world.observe.select({ required: [folded] }));
            const kernel = await Promise.all(rows.map(entity => Observe.toPromise(world.observe.entity(entity, { required: [cell, folded] }))));
            expect(kernel.map(values => values?.[folded])).toEqual(kernel.map(values => values === null ? undefined : foldOf(rebuilt[allCells.findIndex(([x, y]) => x === values[cell][0] && y === values[cell][1])])));
            held = Math.max(held, incremental.reduce((sum, bucket) => sum + bucket.length, 0));
        }
        expect(held).toBeGreaterThan(400);
    });
});

const rank = Symbol("indexesTest/rank");
const lane = Symbol("indexesTest/lane");
const flag = Symbol("indexesTest/flag");
const pair = Symbol("indexesTest/pair");
declare module "@adobe/data-ecs" {
    interface Components {
        [rank]: { type: number };
        [lane]: { type: number };
        [flag]: { type: boolean };
        [pair]: { type: readonly [number, number] };
    }
}
Component.register(rank, { type: { type: "number" } });
Component.register(lane, { type: { type: "integer", minimum: -100, maximum: 100 } });
Component.register(flag, { type: { type: "boolean" } });
Component.register(pair, { type: { type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2 } });

const byRank = Index.create({ name: "indexesTest/byRank", key: [rank], sorted: true });
const byLaneRank = Index.create({ name: "indexesTest/byLaneRank", key: [lane, rank], sorted: true, components: { has: [weight] } });
const byName = Index.create({ name: "indexesTest/byName", key: [label], sorted: true, unique: true });
const byFlagPair = Index.create({ name: "indexesTest/byFlagPair", key: [flag, pair], sorted: true });

/** What a sorted lookup gave: its rows' entities and ranks, and whether it changed. */
let ranked: { readonly ranks: readonly number[]; readonly changed: boolean } = { ranks: [], changed: false };
const ranksOf = (list: { readonly length: number; readonly changed: boolean; at(index: number): { readonly [rank]: number } }) => ({
    ranks: Array.from({ length: list.length }, (_, i) => list.at(i)[rank]),
    changed: list.changed,
});

describe("sorted indexes on the main thread", () => {
    const spawnRanks = System.create({ input: { type: "object", properties: { ranks: { type: "array", items: { type: "number" } } } } }, ({ input, commands }) => {
        for (const value of input.ranks) commands.spawn([rank])({ [rank]: value });
    });
    const query = System.create({
        input: { type: "object", properties: { kind: { type: "string" }, value: { type: "number" }, other: { type: "number" } } },
        lookup: { ranks: { index: byRank, read: [rank] } },
    }, ({ input, lookup }) => {
        const { value, other } = input;
        switch (input.kind) {
            case "all": ranked = ranksOf(lookup.ranks()); break;
            case "eq": ranked = ranksOf(lookup.ranks(value)); break;
            case ">=": ranked = ranksOf(lookup.ranks({ ">=": value })); break;
            case ">": ranked = ranksOf(lookup.ranks({ ">": value })); break;
            case "<": ranked = ranksOf(lookup.ranks({ "<": value })); break;
            case "<=": ranked = ranksOf(lookup.ranks({ "<=": value })); break;
            case "between": ranked = ranksOf(lookup.ranks({ ">=": value, "<": other })); break;
            case "!=": ranked = ranksOf(lookup.ranks({ "!=": value })); break;
            case "== and !=": ranked = ranksOf(lookup.ranks({ ">": value, "!=": other })); break;
            default: {
                // A comparison held, not a literal: the plugin passes it whole.
                const held = { ">": value, "<=": other };
                ranked = ranksOf(lookup.ranks(held));
            }
        }
    });
    it("give rows in key order, numbers numerically with NaN last and -0 as +0, then by entity, for every comparison", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawnRanks, { ranks: [3, -1, NaN, 2, -0, 0, 2, Infinity, -Infinity, 10] });
        await world.run(query, { kind: "all", value: 0, other: 0 });
        expect(ranked.ranks).toEqual([-Infinity, -1, -0, 0, 2, 2, 3, 10, Infinity, NaN]);
        expect(ranked.changed).toBe(true);
        const ask = async (kind: string, value: number, other = 0) => {
            await world.run(query, { kind, value, other });
            return ranked.ranks;
        };
        expect(await ask("eq", 2)).toEqual([2, 2]);
        expect(await ask("eq", 0)).toEqual([-0, 0]);
        expect(await ask("eq", 5)).toEqual([]);
        expect(await ask(">=", 2)).toEqual([2, 2, 3, 10, Infinity, NaN]);
        expect(await ask(">", 2)).toEqual([3, 10, Infinity, NaN]);
        expect(await ask("<", 2)).toEqual([-Infinity, -1, -0, 0]);
        expect(await ask("<=", 2)).toEqual([-Infinity, -1, -0, 0, 2, 2]);
        expect(await ask("between", -1, 3)).toEqual([-1, -0, 0, 2, 2]);
        expect(await ask("!=", 2)).toEqual([-Infinity, -1, -0, 0, 3, 10, Infinity, NaN]);
        expect(await ask("== and !=", -1, 3)).toEqual([-0, 0, 2, 2, 10, Infinity, NaN]);
        expect(await ask("held", 0, 3)).toEqual([2, 2, 3]);
        const all = await Observe.toPromise(world.observe.select({ required: [rank], order: { [rank]: true } }));
        // Ties are in entity order.
        let entities: readonly Entity[] = [];
        await world.run(System.create({ lookup: { ranks: { index: byRank } } }, ({ lookup }) => {
            const twos = lookup.ranks(2);
            entities = [twos.at(0).entity, twos.at(1).entity];
        }));
        expect(entities[0] < entities[1]).toBe(true);
        void all;
    });
    it("take a prefix of a compound key, its last part possibly a comparison", async () => {
        await using world = createWorld({ [workers]: 0 });
        const model = Array.from({ length: 30 }, (_, k) => [(k % 3) - 1, 29 - k] as const);
        await world.run(System.create(({ commands }) => {
            model.forEach(([laneValue, rankValue], k) => commands.spawn([lane, rank, weight])({ [lane]: laneValue, [rank]: rankValue, [weight]: k }));
        }));
        let found: (readonly (readonly number[])[])[] = [];
        await world.run(System.create({ lookup: { lanes: { index: byLaneRank, read: [lane, rank] } } }, ({ lookup }) => {
            const read = (list: { readonly length: number; at(index: number): { readonly [lane]: number; readonly [rank]: number } }) => Array.from({ length: list.length }, (_, i) => [list.at(i)[lane], list.at(i)[rank]]);
            found = [read(lookup.lanes(0)), read(lookup.lanes(1, { "<": 10 })), read(lookup.lanes({ "<": 0 })), read(lookup.lanes(-1, 26)), read(lookup.lanes(-1, 27))];
        }));
        const sorted = [...model].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        expect(found).toEqual([
            sorted.filter(([l]) => l === 0),
            sorted.filter(([l, r]) => l === 1 && r < 10),
            sorted.filter(([l]) => l < 0),
            sorted.filter(([l, r]) => l === -1 && r === 26),
            [],
        ]);
    });
    it("order strings by code point, booleans false first and tuples element by element", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(System.create(({ commands }) => {
            for (const name of ["b", "a", "～", "\u{1F600}", "ab", ""]) commands.spawn([label])({ [label]: name });
            for (const [on, x, y] of [[true, 1, 2], [false, 3, 0], [true, 1, 1], [false, -1, 5]] as const) commands.spawn([flag, pair])({ [flag]: on, [pair]: [x, y] });
        }));
        let names: string[] = [];
        let pairs: (readonly [boolean, readonly [number, number]])[] = [];
        let one: string | null = null;
        let none: string | null = "x";
        await world.run(System.create({ lookup: { names: { index: byName, read: [label] }, pairs: { index: byFlagPair, read: [flag, pair] } } }, ({ lookup }) => {
            const all = lookup.names();
            names = Array.from({ length: all.length }, (_, i) => all.at(i)[label]);
            const ordered = lookup.pairs();
            pairs = Array.from({ length: ordered.length }, (_, i) => [ordered.at(i)[flag], ordered.at(i)[pair]] as const);
            one = lookup.names("ab")?.[label] ?? null;
            none = lookup.names("zz")?.[label] ?? null;
        }));
        expect(names).toEqual(["", "a", "ab", "b", "～", "\u{1F600}"]);
        expect(pairs).toEqual([[false, [-1, 5]], [false, [3, 0]], [true, [1, 1]], [true, [1, 2]]]);
        expect(one).toBe("ab");
        expect(none).toBe(null);
    });
    it("report changed for a range only when an entity entered, left or moved in it, or watched values changed, since the system last ran", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawnRanks, { ranks: Array.from({ length: 1000 }, (_, k) => k) });
        await world.run(query, { kind: "between", value: 100, other: 110 });
        expect(ranked).toMatchObject({ changed: true });
        await world.run(query, { kind: "between", value: 100, other: 110 });
        expect(ranked).toMatchObject({ changed: false, ranks: [100, 101, 102, 103, 104, 105, 106, 107, 108, 109] });
        const entities = await Observe.toPromise(world.observe.select({ required: [rank], order: { [rank]: true } }));
        // A move far away isn't one here.
        await world.run(System.create(({ commands }) => { commands.add(entities[900], rank, 950.5); }));
        await world.run(query, { kind: "between", value: 100, other: 110 });
        expect(ranked.changed).toBe(false);
        await world.run(System.create(({ commands }) => { commands.add(entities[900], rank, 105.5); }));
        await world.run(query, { kind: "between", value: 100, other: 110 });
        expect(ranked).toMatchObject({ changed: true, ranks: [100, 101, 102, 103, 104, 105, 105.5, 106, 107, 108, 109] });
        // Emptied, it's changed once.
        await world.run(System.create(({ commands }) => { for (const entity of entities) commands.despawn(entity); }));
        await world.run(query, { kind: "between", value: 100, other: 110 });
        expect(ranked).toMatchObject({ changed: true, ranks: [] });
        await world.run(query, { kind: "between", value: 100, other: 110 });
        expect(ranked).toMatchObject({ changed: false, ranks: [] });
    });
    it("report a unique sorted index's conflicts, keeping the lower entity index", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(System.create(({ commands }) => {
            commands.spawn([label])({ [label]: "one" });
            commands.spawn([label])({ [label]: "two" });
        }));
        const [first, second] = await Observe.toPromise(world.observe.select({ required: [label] }));
        let kept: Entity | null = null;
        const find = System.create({ lookup: { names: { index: byName } } }, ({ lookup }) => { kept = lookup.names("one")?.entity ?? null; });
        expect((await world.run(find)).failures).toEqual([]);
        await world.run(System.create(({ commands }) => { commands.add(second, label, "one"); }));
        const report = await world.run(find);
        expect(kept).toBe(first);
        expect(report.failures).toEqual([{ kind: "index", name: "indexesTest/byName", message: `Index "indexesTest/byName" is unique, and entities ${first} and ${second} both have key "one"; lookups give ${first}, the one with the lower entity index.`, stack: null }]);
    });
});

let incrementalRanks: readonly number[] = [];
let incrementalLanes: readonly (readonly number[])[] = [];
const probeSorted = System.create({ name: "indexesTest/probeSorted", lookup: { lanes: { index: byLaneRank } } }, ({ lookup }) => {
    const all = lookup.lanes();
    incrementalRanks = Array.from({ length: all.length }, (_, i) => all.at(i).entity);
    incrementalLanes = [-1, 0, 1].map(laneValue => {
        const list = lookup.lanes(laneValue, { ">=": 100, "<": 600 });
        return Array.from({ length: list.length }, (_, i) => list.at(i).entity);
    });
});
const rerank = System.create({
    name: "indexesTest/rerank", input: { type: "object", properties: { share: { type: "number" }, seed: { type: "integer" } } },
    components: { read: [weight], write: [rank] }, before: [probeSorted],
}, (row, { input }) => {
    if ((row[weight] * 7919 + input.seed) % 1000 < input.share * 1000) row[rank] = (row[weight] * 31 + input.seed * 17) % 1000;
});

/** A kernel folding the entities of its row's lane's range of ranks within 50 of its own, so kernels' sorted lookups are checked against the same index. */
const foldLane = System.create({
    name: "indexesTest/foldLane", kernel: "cpu",
    components: { read: [lane, rank], write: [folded] },
    lookup: { lanes: { index: byLaneRank } },
}, (row, { lookup }) => {
    const r = row[rank];
    const near = lookup.lanes(row[lane], { ">=": r - 50, "<": r + 50 });
    let sum = 0;
    for (let i = 0; i < near.length; i++) sum += (near.at(i).entity % 997) * (i + 1);
    row[folded] = sum;
});

describe("an incrementally refreshed sorted index", () => {
    it.each([[true], [false]])("equals one built from scratch after random spawns, despawns, moves and key writes, its blocks split and dropped, as kernels read it too, WASM %s", async wasm => {
        await using world = createWorld({ [workers]: 0 }, { wasm });
        const next = random(4242);
        const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(next() * list.length)];
        let held = 0;
        for (let step = 0; step < 60; step++) {
            const living = await Observe.toPromise(world.observe.select({ required: [lane] }));
            const operations = Math.floor(next() * 120);
            const plan: (readonly [string, Entity | undefined, number])[] = [];
            for (let k = 0; k < operations; k++) plan.push([pick(["spawn", "spawn", "spawn", "despawn", "despawn", "weigh", "unweigh", "set", "lane"]) ?? "spawn", pick(living), Math.floor(next() * 1000)]);
            await world.run(System.create(({ commands }) => {
                for (const [operation, entity, value] of plan) {
                    if (operation === "spawn") commands.spawn([lane, rank, weight, folded])({ [lane]: (value % 3) - 1, [rank]: value % 7 === 0 ? 500 : value, [weight]: value, [folded]: 0 });
                    else if (entity === undefined) continue;
                    else if (operation === "despawn") commands.despawn(entity);
                    else if (operation === "weigh") commands.add(entity, weight, value);
                    else if (operation === "unweigh") commands.remove(entity, weight);
                    else if (operation === "set") commands.add(entity, rank, value);
                    else commands.add(entity, lane, (value % 3) - 1);
                }
            }));
            await world.run(System.create({ systems: [rerank, probeSorted] }), { share: next() < 0.1 ? 0.9 : 0.05, seed: step });
            const scratch = Index.create({ key: [lane, rank], sorted: true, components: { has: [weight] } });
            let rebuiltRanks: readonly number[] = [];
            let rebuiltLanes: readonly (readonly number[])[] = [];
            await world.run(System.create({ lookup: { lanes: { index: scratch } } }, ({ lookup }) => {
                const all = lookup.lanes();
                rebuiltRanks = Array.from({ length: all.length }, (_, i) => all.at(i).entity);
                rebuiltLanes = [-1, 0, 1].map(laneValue => {
                    const list = lookup.lanes(laneValue, { ">=": 100, "<": 600 });
                    return Array.from({ length: list.length }, (_, i) => list.at(i).entity);
                });
            }));
            expect(incrementalRanks).toEqual(rebuiltRanks);
            expect(incrementalLanes).toEqual(rebuiltLanes);
            // A kernel's ranges, each row's, against the same ranges from the index built from scratch.
            await world.run(foldLane);
            const rows = await Observe.toPromise(world.observe.select({ required: [folded] }));
            const kernel = await Promise.all(rows.map(entity => Observe.toPromise(world.observe.entity(entity, { required: [lane, rank, folded] }))));
            let expected: readonly number[] = [];
            await world.run(System.create({ lookup: { lanes: { index: scratch } } }, ({ lookup }) => {
                expected = kernel.map(values => {
                    if (values === null) return -1;
                    const list = lookup.lanes(values[lane], { ">=": values[rank] - 50, "<": values[rank] + 50 });
                    let sum = 0;
                    for (let i = 0; i < list.length; i++) sum += (list.at(i).entity % 997) * (i + 1);
                    return sum;
                });
            }));
            expect(kernel.map(values => values?.[folded] ?? -1)).toEqual(expected);
            held = Math.max(held, incrementalRanks.length);
            // Once its blocks have split, every entity of a lane goes, so whole blocks empty and are dropped.
            if (step === 40) await world.run(System.create({ components: { read: [lane] } }, (row, { commands }) => { if (row[lane] < 1) commands.despawn(row.entity); }));
        }
        expect(held).toBeGreaterThan(250);
    });
});

/** Whether two objects have the same own properties in the same order, each accessor's functions the same ones. */
const sameAccessors = (a: object, b: object): boolean => {
    const keysOf = (value: object): readonly (string | symbol)[] => Reflect.ownKeys(value);
    const keys = keysOf(a);
    if (keys.length !== keysOf(b).length) return false;
    return keys.every((key, k) => {
        const first = Object.getOwnPropertyDescriptor(a, key);
        const second = Object.getOwnPropertyDescriptor(b, key);
        return keysOf(b)[k] === key && first?.get === second?.get && first?.set === second?.set && (typeof first?.value !== "function" || first.value === second?.value);
    });
};

describe("lists and their rows", () => {
    it("share their accessors across call sites and positions, so a body reading many sees one hidden class", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawnCells, { cells: [[0, 0], [0, 0], [1, 1]] });
        await world.run(System.create(({ commands }) => {
            for (const value of [1, 2, 3]) commands.spawn([rank])({ [rank]: value });
        }));
        let hashed: readonly object[] = [];
        let sorted: readonly object[] = [];
        await world.run(System.create({ lookup: { near: { index: grid, read: [weight] }, ranks: { index: byRank, read: [rank] } } }, ({ lookup }) => {
            const first = lookup.near([0, 0]);
            const second = lookup.near([1, 1]);
            hashed = [first, second, first.at(0), first.at(1), second.at(0)];
            const all = lookup.ranks();
            const some = lookup.ranks({ ">": 1 });
            sorted = [all, some, all.at(0), all.at(1), some.at(0)];
        }));
        expect(hashed).toHaveLength(5);
        expect(sameAccessors(hashed[0], hashed[1])).toBe(true);
        expect(sameAccessors(hashed[2], hashed[3]) && sameAccessors(hashed[2], hashed[4])).toBe(true);
        expect(sameAccessors(sorted[0], sorted[1])).toBe(true);
        expect(sameAccessors(sorted[2], sorted[3]) && sameAccessors(sorted[2], sorted[4])).toBe(true);
    });
});

describe("a lookup's rows across sync points", () => {
    it("read the arrays their archetype grew into, after a sync point replaced them", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawnCells, { cells: [[0, 0], [0, 0]] });
        let weights: number[] = [];
        const read = System.create({ lookup: { near: { index: grid, read: [weight] } } }, ({ lookup }) => {
            const near = lookup.near([0, 0]);
            weights = Array.from({ length: near.length }, (_, i) => near.at(i)[weight]);
        });
        await world.run(read);
        expect(weights).toEqual([0, 1]);
        // Enough spawns into the same archetype to grow its arrays, and new weights for the two already read.
        await world.run(spawnCells, { cells: Array.from({ length: 200 }, () => [5, 5]) });
        await world.run(System.create({ components: { write: [weight], read: [cell] } }, row => {
            if (row[cell][0] === 0) row[weight] += 10;
        }));
        await world.run(read);
        expect(weights).toEqual([10, 11]);
    });
});
