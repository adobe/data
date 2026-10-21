import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Index } from "../../interface/indexes/index-type.js";
import { Observe } from "../../observe/index.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld, type CreatedWorld } from "./create.js";

const cell = Symbol("indexKernelsTest/cell");
const weight = Symbol("indexKernelsTest/weight");
const total = Symbol("indexKernelsTest/total");
const count = Symbol("indexKernelsTest/count");
const lane = Symbol("indexKernelsTest/lane");
const rank = Symbol("indexKernelsTest/rank");
const serial = Symbol("indexKernelsTest/serial");
const target = Symbol("indexKernelsTest/target");
const seen = Symbol("indexKernelsTest/seen");
const changes = Symbol("indexKernelsTest/changes");
const ranked = Symbol("indexKernelsTest/ranked");

declare module "@adobe/ecs" {
    interface Components {
        [cell]: { type: readonly [number, number] };
        [weight]: { type: number };
        [total]: { type: number };
        [count]: { type: number };
        [lane]: { type: number };
        [rank]: { type: number };
        [serial]: { type: number };
        [target]: { type: number };
        [seen]: { type: Entity };
        [changes]: { type: number };
        [ranked]: { type: true };
    }
}
Component.register(cell, { type: { type: "array", items: { type: "integer", minimum: -1000, maximum: 1000 }, minItems: 2, maxItems: 2 } });
Component.register(weight, { type: { type: "number", precision: 1 } });
Component.register(total, { type: { type: "number" } });
Component.register(count, { type: { type: "number" } });
Component.register(lane, { type: { type: "integer", minimum: 0, maximum: 1000 } });
Component.register(rank, { type: { type: "number" } });
Component.register(serial, { type: { type: "integer", minimum: 0, maximum: 1000000 } });
Component.register(target, { type: { type: "integer", minimum: 0, maximum: 1000000 } });
Component.register(seen, { type: Entity.schema });
Component.register(changes, { type: { type: "number" } });
Component.register(ranked, { type: { const: true } });

const grid = Index.create({ name: "indexKernelsTest/grid", key: [cell], components: { has: [weight] } });
const lanes = Index.create({ name: "indexKernelsTest/lanes", key: [lane, rank], sorted: true, components: { has: [ranked] } });
const serials = Index.create({ name: "indexKernelsTest/serials", key: [serial], unique: true, components: { has: [weight] } });

/** Each row's neighbors in the 3 by 3 cells around its own: how many, and their weights' sum. */
const neighbors = System.create({
    name: "indexKernelsTest/neighbors", kernel: "cpu",
    components: { read: [cell], write: [total, count] },
    lookup: { near: { index: grid, read: [weight] } },
}, (row, { lookup }) => {
    const [x, y] = row[cell];
    let sum = 0;
    let found = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const near = lookup.near([x + dx, y + dy]);
            for (let i = 0; i < near.length; i++) {
                sum += near.at(i)[weight];
                found++;
            }
        }
    }
    row[total] = sum;
    row[count] = found;
});

/** The same, on the main thread, for comparison. */
const neighborsByHand = System.create({ name: "indexKernelsTest/neighborsByHand", components: { read: [cell], write: [total, count] }, lookup: { near: { index: grid, read: [weight] } } }, (row, { lookup }) => {
    const [x, y] = row[cell];
    let sum = 0;
    let found = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const near = lookup.near([x + dx, y + dy]);
        for (let i = 0; i < near.length; i++) {
            sum += near.at(i)[weight];
            found++;
        }
    }
    row[total] = sum;
    row[count] = found;
});

/** How many rows of the row's lane have a rank within 5 of its own, and the first of them, through a sorted range. */
const window = System.create({
    name: "indexKernelsTest/window", kernel: "cpu",
    components: { read: [lane, rank], write: [count, seen] },
    lookup: { inLane: { index: lanes } },
}, (row, { lookup }) => {
    const r = row[rank];
    const near = lookup.inLane(row[lane], { ">=": r - 5, "<": r + 5 });
    row[count] = near.length;
    row[seen] = near.at(0).entity;
});

const windowByHand = System.create({ name: "indexKernelsTest/windowByHand", components: { read: [lane, rank], write: [count, seen] }, lookup: { inLane: { index: lanes } } }, (row, { lookup }) => {
    const r = row[rank];
    const near = lookup.inLane(row[lane], { ">=": r - 5, "<": r + 5 });
    row[count] = near.length;
    row[seen] = near.at(0).entity;
});

/** The weight of the entity whose serial is the row's target, or -1. */
const follow = System.create({
    name: "indexKernelsTest/follow", kernel: "cpu",
    components: { read: [target], write: [total] },
    lookup: { bySerial: { index: serials, read: [weight] } },
}, (row, { lookup }) => {
    const found = lookup.bySerial(row[target]);
    row[total] = found === null ? -1 : found[weight];
});

/** Counts runs whose list of the row's cell changed. */
const watch = System.create({
    name: "indexKernelsTest/watch", kernel: "cpu",
    components: { read: [cell], write: [changes] },
    lookup: { near: { index: grid, changed: [weight] } },
}, (row, { lookup }) => {
    if (lookup.near([row[cell][0], row[cell][1]]).changed) row[changes] = row[changes] + 1;
});

const spawnGrid = System.create({ name: "indexKernelsTest/spawnGrid", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    for (let k = 0; k < input.count; k++) commands.spawn([cell, weight, total, count, changes, serial])({ [cell]: [(k * 7) % 5, (k * 3) % 4], [weight]: k % 9, [total]: 0, [count]: 0, [changes]: 0, [serial]: k });
});

const spawnLanes = System.create({ name: "indexKernelsTest/spawnLanes", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    for (let k = 0; k < input.count; k++) commands.spawn([lane, rank, ranked, count, seen])({ [lane]: k % 3, [rank]: (k * 37) % 101, [ranked]: true, [count]: 0, [seen]: Entity.none });
});

const read = async (world: CreatedWorld, required: readonly Component.Key[], keys: readonly Component.Key[]): Promise<readonly unknown[][]> => {
    const entities = await Observe.toPromise(Observe.select(world, { required: [...required] }));
    // Entities of this world hold these components, by their schemas.
    const rows = await Promise.all(entities.map(entity => Observe.toPromise(Observe.entity(world, entity, { required: [...keys] })) as Promise<{ readonly [key: symbol]: unknown } | null>));
    return rows.map(row => keys.map(key => row?.[key]));
};

describe.each([[true], [false]])("kernels looking up through indexes, WASM %s", wasm => {
    it("find a hash index's buckets by a literal tuple key, as a main-thread system does", async () => {
        await using world = createWorld({ [workers]: 0 }, { wasm });
        await world.run(spawnGrid, { count: 60 });
        await world.run(neighbors);
        const kernel = await read(world, [cell], [total, count]);
        await world.run(neighborsByHand);
        expect(kernel).toEqual(await read(world, [cell], [total, count]));
        expect(kernel.some(([, found]) => Number(found) > 1)).toBe(true);
    });
    it("find a sorted index's range of a prefix and a comparison, in key order, with each row's entity", async () => {
        await using world = createWorld({ [workers]: 0 }, { wasm });
        await world.run(spawnLanes, { count: 400 });
        await world.run(window);
        const kernel = await read(world, [ranked], [count, seen]);
        await world.run(windowByHand);
        expect(kernel).toEqual(await read(world, [ranked], [count, seen]));
        expect(kernel.some(([found]) => Number(found) > 3)).toBe(true);
    });
    it("give a unique index's row or null", async () => {
        await using world = createWorld({ [workers]: 0 }, { wasm });
        await world.run(spawnGrid, { count: 10 });
        await world.run(System.create(({ commands }) => {
            commands.spawn([target, total])({ [target]: 3, [total]: 0 });
            commands.spawn([target, total])({ [target]: 99, [total]: 0 });
        }));
        await world.run(follow);
        expect((await read(world, [target], [total])).map(([value]) => value)).toEqual([3, -1]);
    });
    it("report a list changed only when an entity entered, left or moved in it or a watched value changed", async () => {
        await using world = createWorld({ [workers]: 0 }, { wasm });
        await world.run(spawnGrid, { count: 20 });
        await world.run(watch);
        await world.run(watch);
        const counted = async (): Promise<number> => (await read(world, [cell], [changes])).reduce((sum, [value]) => sum + Number(value), 0);
        expect(await counted()).toBe(20);
        const entities = await Observe.toPromise(Observe.select(world, { required: [cell] }));
        await world.run(System.create(({ commands }) => { commands.add(entities[0], weight, 100); }));
        await world.run(watch);
        // The rows of the changed entity's cell saw it change.
        expect(await counted()).toBeGreaterThan(20);
    });
});

/** A comparison on a hash index. */
const compared = System.create({
    name: "indexKernelsTest/compared", kernel: "cpu",
    components: { read: [serial], write: [count] },
    lookup: { bySerial: { index: serials } },
}, (row, { lookup }) => {
    // @ts-expect-error a hash index takes whole keys
    row[count] = lookup.bySerial({ "<": row[serial] }) === null ? 0 : 1;
});

describe("kernels looking up through indexes, at registration", () => {
    it("throw for a comparison on a hash index", async () => {
        await using world = createWorld({ [workers]: 0 }, { wasm: true });
        await world.run(spawnGrid, { count: 4 });
        await expect(world.run(compared)).rejects.toThrow(/sorted/);
    });
});
