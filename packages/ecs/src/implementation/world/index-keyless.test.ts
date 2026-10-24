// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import type { Entity } from "../../interface/entity/entity.js";
import { Index } from "../../interface/indexes/index-type.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld, type CreatedWorld } from "./create.js";
import { select } from "./reads.test-helper.js";

// Indexes without a key: membership by `has` and `not`, in entity order, and its changes.

const weight = Symbol("indexKeylessTest/weight");
const hidden = Symbol("indexKeylessTest/hidden");
const color = Symbol("indexKeylessTest/color");
const spin = Symbol("indexKeylessTest/spin");
const total = Symbol("indexKeylessTest/total");
const count = Symbol("indexKeylessTest/count");
const visited = Symbol("indexKeylessTest/visited");

declare module "@adobe/ecs" {
    interface Components {
        [weight]: { type: number };
        [hidden]: { type: true };
        [color]: { type: number };
        [spin]: { type: number };
        [total]: { type: number };
        [count]: { type: number };
        [visited]: { type: number };
    }
}

const shown = Index.create({ key: [], components: { has: [weight], not: [hidden] } });
const everything = Index.create({ key: [] });
const inOrder = Index.create({ key: [], sorted: true, components: { has: [weight] } });

/** What a lookup gave: its entities and weights, in its order, its length and whether it changed. */
type Seen = { readonly entities: readonly Entity[]; readonly weights: readonly number[]; readonly length: number; readonly changed: boolean };
let seen: Seen = { entities: [], weights: [], length: 0, changed: false };
let all: readonly Entity[] = [];

const look = System.create({
    lookup: { shown: { index: shown, read: [weight] }, all: { index: everything } },
}, ({ lookup }) => {
    const rows = lookup.shown();
    const entities: Entity[] = [];
    const weights: number[] = [];
    for (let i = 0; i < rows.length; i++) {
        entities.push(rows.at(i).entity);
        weights.push(rows.at(i)[weight]);
    }
    seen = { entities, weights, length: rows.length, changed: rows.changed };
    const every = lookup.all();
    all = Array.from({ length: every.length }, (_, i) => every.at(i).entity);
});

/** Whether the lookup through `shown` changed, with `color` watched. */
let watchedChanged = false;
const watchColor = System.create({ lookup: { shown: { index: shown, changed: [weight] } } }, ({ lookup }) => {
    watchedChanged = lookup.shown().changed;
});

const byIndex = (a: Entity, b: Entity): number => (a >>> 0) - (b >>> 0);

/** The entities a query gives, in entity order, with their weights. */
const expected = async (world: CreatedWorld): Promise<{ readonly entities: readonly Entity[]; readonly all: readonly Entity[] }> => ({
    entities: [...await select(world, { required: [weight], not: [hidden] })].sort(byIndex),
    all: [...await select(world, {})].sort(byIndex),
});

const spawn = System.create({}, ({ commands }, input: { readonly weights: readonly number[] }) => {
    for (const value of input.weights) commands.spawn([weight, color])({ [weight]: value, [color]: 0 });
});

describe("an index without a key on the main thread", () => {
    it("holds the entities with its has and none of its not, in entity order, following spawns, despawns and moves", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawn, { weights: [1, 2, 3, 4, 5, 6] });
        await world.run(System.create(({ commands }) => {
            commands.spawn([color])({ [color]: 1 });
            commands.spawn([])({});
        }));
        await world.run(look);
        expect(seen.entities).toEqual((await expected(world)).entities);
        expect(seen.weights).toEqual([1, 2, 3, 4, 5, 6]);
        expect(seen.length).toBe(6);
        // Without has or not, every entity but the resource entity, those with no components included.
        expect(all).toEqual((await expected(world)).all);
        expect(all.length).toBe(8);
        const [first, second, third] = seen.entities;
        // Hiding leaves, despawning leaves and moves the last row into its place, adding a component moves archetype.
        await world.run(System.create(({ commands }) => {
            commands.add(first, hidden);
            commands.despawn(second);
            commands.add(third, spin, 1);
        }));
        await world.run(look);
        expect(seen.entities).toEqual((await expected(world)).entities);
        expect(seen.weights).toEqual([3, 4, 5, 6]);
        expect(all).toEqual((await expected(world)).all);
        await world.run(System.create(({ commands }) => {
            commands.remove(first, hidden);
            commands.remove(third, weight);
        }));
        await world.run(look);
        expect(seen.entities).toEqual((await expected(world)).entities);
        expect(seen.weights).toEqual([1, 4, 5, 6]);
    });
    it("reports changed only when an entity entered or left, or a watched component changed, since the system last ran", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawn, { weights: [1, 2, 3] });
        await world.run(look);
        expect(seen.changed).toBe(true);
        await world.run(look);
        expect(seen.changed).toBe(false);
        // A write to what it holds by, unwatched, or to anything else, changes nothing.
        await world.run(System.create({ components: { write: [weight, color] } }, row => {
            row[weight] = row[weight] + 1;
            row[color] = 2;
        }));
        await world.run(look);
        expect(seen.changed).toBe(false);
        // An entity moving to another archetype it holds keeps its place, and an entity it doesn't hold isn't its.
        const entities = seen.entities;
        await world.run(System.create(({ commands }) => { commands.add(entities[0], spin, 1); }));
        await world.run(look);
        expect(seen.changed).toBe(false);
        await world.run(System.create(({ commands }) => { commands.spawn([color])({ [color]: 3 }); }));
        await world.run(look);
        expect(seen.changed).toBe(false);
        await world.run(System.create(({ commands }) => { commands.add(entities[1], hidden); }));
        await world.run(look);
        expect(seen.changed).toBe(true);
        // A watched component written in one of its rows.
        await world.run(watchColor);
        await world.run(watchColor);
        expect(watchedChanged).toBe(false);
        await world.run(System.create({ components: { write: [color] } }, row => { row[color] = 5; }));
        await world.run(watchColor);
        expect(watchedChanged).toBe(false);
        await world.run(System.create({ components: { write: [weight] } }, row => { row[weight] = 5; }));
        await world.run(watchColor);
        expect(watchedChanged).toBe(true);
        await world.run(watchColor);
        expect(watchedChanged).toBe(false);
    });
    it("runs a system's rows in entity order as a sorted index's order", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawn, { weights: [5, 4, 3, 2, 1] });
        const entities = (await expected(world)).entities;
        // Moving the first to another archetype puts it last in storage order.
        await world.run(System.create(({ commands }) => { commands.add(entities[0], spin, 1); }));
        const order: Entity[] = [];
        await world.run(System.create({ components: { read: [weight] }, order: inOrder }, row => { if (row[weight] > 0) order.push(row.entity); }));
        expect(order).toEqual(entities);
    });
});

/** A small random generator, the same for a seed. */
const random = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
};

describe("an incrementally refreshed index without a key", () => {
    it("holds what a query finds after random spawns, despawns and moves, patched or, past what a patch takes, built again", async () => {
        await using world = createWorld({ [workers]: 0 });
        const next = random(9876);
        const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(next() * list.length)];
        let held = 0;
        for (let step = 0; step < 80; step++) {
            const living = await select(world, {});
            // Now and then more entities enter and leave than a patch takes.
            const operations = next() < 0.1 ? 6000 : Math.floor(next() * 120);
            const plan: (readonly [string, Entity | undefined, number])[] = [];
            for (let k = 0; k < operations; k++) plan.push([pick(["spawn", "spawn", "spawn", "bare", "despawn", "despawn", "hide", "show", "weigh", "unweigh", "spin"]) ?? "spawn", pick(living), Math.floor(next() * 1000)]);
            await world.run(System.create(({ commands }) => {
                for (const [operation, entity, value] of plan) {
                    if (operation === "spawn") commands.spawn([weight, color])({ [weight]: value, [color]: 0 });
                    else if (operation === "bare") commands.spawn([color])({ [color]: value });
                    else if (entity === undefined) continue;
                    else if (operation === "despawn") commands.despawn(entity);
                    else if (operation === "hide") commands.add(entity, hidden);
                    else if (operation === "show") commands.remove(entity, hidden);
                    else if (operation === "weigh") commands.add(entity, weight, value);
                    else if (operation === "unweigh") commands.remove(entity, weight);
                    else commands.add(entity, spin, value);
                }
            }));
            await world.run(look);
            const found = await expected(world);
            expect(seen.entities).toEqual(found.entities);
            expect(all).toEqual(found.all);
            held = Math.max(held, seen.length);
        }
        expect(held).toBeGreaterThan(1000);
    });
});

/** Each row's tally of the rows of `shown`: how many, and the sum of a window of their weights. */
const tally = System.create({
    kernel: true,
    components: { read: [color], write: [total, count] },
    lookup: { shown: { index: shown, read: [weight] } },
}, (row, { lookup }) => {
    const rows = lookup.shown();
    let sum = 0;
    for (let i = row[color] % 7; i < rows.length; i += 7) sum += rows.at(i)[weight];
    row[total] = sum;
    row[count] = rows.length;
});
const tallyByHand = System.create({ components: { read: [color], write: [total, count] }, lookup: { shown: { index: shown, read: [weight] } } }, (row, { lookup }) => {
    const rows = lookup.shown();
    let sum = 0;
    for (let i = row[color] % 7; i < rows.length; i += 7) sum += rows.at(i)[weight];
    row[total] = sum;
    row[count] = rows.length;
});
/** Counts runs whose list changed, `weight` watched. */
const visit = System.create({
    kernel: true,
    components: { write: [visited] },
    lookup: { shown: { index: shown, changed: [weight] } },
}, (row, { lookup }) => {
    if (lookup.shown().changed) row[visited] = row[visited] + 1;
});

const values = async (world: CreatedWorld, keys: readonly Component.Key[]): Promise<readonly unknown[]> => {
    let found: readonly unknown[] = [];
    const entities = [...await select(world, { required: [total] })].sort(byIndex);
    await world.run(System.create({ lookup: { of: { read: [total, count, visited] } } }, ({ lookup }) => {
        found = entities.map(entity => {
            const row = lookup.of(entity);
            return row === null ? null : keys.map(key => key === total ? row[total] : key === count ? row[count] : row[visited]);
        });
    }));
    return found;
};

describe.each([[true], [false]])("kernels looking up through an index without a key, WASM %s", wasm => {
    it("find its rows, in entity order, and their changes, as a main-thread system does", async () => {
        await using world = createWorld({ [workers]: 0 }, { wasm });
        await world.run(System.create(({ commands }) => {
            for (let k = 0; k < 300; k++) commands.spawn([weight, color, total, count, visited])({ [weight]: k % 11, [color]: k, [total]: 0, [count]: 0, [visited]: 0 });
            for (let k = 0; k < 40; k++) commands.spawn([color, total, count, visited])({ [color]: k, [total]: 0, [count]: 0, [visited]: 0 });
        }));
        await world.run(System.create({ components: { read: [color] } }, (row, { commands }) => {
            if (row[color] % 5 === 0) commands.add(row.entity, hidden);
            if (row[color] % 9 === 0) commands.despawn(row.entity);
        }));
        await world.run(tally);
        const kernel = await values(world, [total, count]);
        await world.run(tallyByHand);
        expect(kernel).toEqual(await values(world, [total, count]));
        expect(kernel.some(row => Array.isArray(row) && Number(row[0]) > 0)).toBe(true);
        await world.run(visit);
        await world.run(visit);
        const visits = async (): Promise<number> => (await values(world, [visited])).reduce<number>((sum, row) => sum + (Array.isArray(row) ? Number(row[0]) : 0), 0);
        const rows = (await values(world, [visited])).length;
        expect(await visits()).toBe(rows);
        await world.run(System.create({ components: { write: [color] } }, row => { row[color] = row[color] + 1; }));
        await world.run(visit);
        expect(await visits()).toBe(rows);
        await world.run(System.create({ components: { write: [weight] } }, row => { row[weight] = row[weight] + 1; }));
        await world.run(visit);
        expect(await visits()).toBe(2 * rows);
    });
});
