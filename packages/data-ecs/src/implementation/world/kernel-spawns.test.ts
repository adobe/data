import { describe, expect, it } from "vitest";
import { Archetype } from "../../interface/archetype/archetype.js";
import { Component } from "../../interface/component/component.js";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import { count, read, readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";

const index = Symbol("kernelSpawnsTest/index");
const value = Symbol("kernelSpawnsTest/value");
const extra = Symbol("kernelSpawnsTest/extra");
const flag = Symbol("kernelSpawnsTest/flag");
const made = Symbol("kernelSpawnsTest/made");
const name = Symbol("kernelSpawnsTest/name");
const position = Symbol("kernelSpawnsTest/position");

declare module "@adobe/data-ecs" {
    export interface Components {
        [index]: { type: number };
        [value]: { type: number };
        [extra]: { type: number };
        [flag]: { type: true };
        [made]: { type: true };
        [name]: { type: string | null };
        [position]: { type: readonly [number, number] };
    }
}

Component.register(index, { type: { type: "integer", minimum: 0, maximum: 0xFFFFFFFF } });
Component.register(value, { type: { type: "number", precision: 1 } });
Component.register(extra, { type: { type: "number", precision: 1 } });
Component.register(flag, { type: { const: true } });
Component.register(made, { type: { const: true } });
Component.register(name, { type: { anyOf: [{ type: "string" }, { type: "null" }] } });
Component.register(position, { type: { type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2 } });

const spawned = Archetype.create([value, made]);

const seed = System.create({ name: "kernelSpawnsTest/seed", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) commands.spawn([index])({ [index]: i });
});

/** One spawn per row, from a kernel. */
const fromKernel = System.create({ name: "kernelSpawnsTest/fromKernel", kernel: "cpu", components: { read: [index] } }, (row, { commands }) => {
    commands.spawn(spawned)({ [value]: row[index] });
});

/** The same archetype from a main-thread system, before the kernel. */
const fromMain = System.create({ name: "kernelSpawnsTest/fromMain", before: [fromKernel] }, ({ commands }) => {
    for (let i = 0; i < 3; i++) commands.spawn(spawned)({ [value]: 100 + i });
});

/** Spawns, then adds to and removes from what it spawned, in the same kernel and tick. */
const spawnAndEdit = System.create({ name: "kernelSpawnsTest/spawnAndEdit", kernel: "cpu", components: { read: [index] } }, (row, { commands }) => {
    const entity = commands.spawn([value, flag, made])({ [value]: row[index] });
    commands.add(entity, extra, row[index] * 10);
    commands.remove(entity, flag);
});

/** A spawn with a tuple, and an object component left to its start. */
const withObjects = System.create({ name: "kernelSpawnsTest/withObjects", kernel: "cpu", components: { read: [index] } }, (row, { commands }) => {
    commands.spawn([value, position, name, made])({ [value]: row[index], [position]: [row[index], -row[index]] });
});

const added = { seen: 0 };
const countAdded = System.create({ name: "kernelSpawnsTest/countAdded", components: { added: [value], has: [made] } }, () => { added.seen++; });

const valuesOf = async (world: ReturnType<typeof createWorld>): Promise<(number | null)[]> => readEach(world, await select(world, { required: [made] }), value);

describe("kernel spawns", () => {
    it("land with their values and change ticks, seen once by an added filter", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(seed, { count: 5 });
        await world.run(fromKernel);
        expect(await valuesOf(world)).toEqual([0, 1, 2, 3, 4]);
        added.seen = 0;
        await world.run(countAdded);
        await world.run(countAdded);
        expect(added.seen).toBe(5);
        await world.dispose();
    });

    it("join main-thread spawns of the same archetype: the main thread's first, then the kernel's in row order", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(seed, { count: 4 });
        const frame = System.composite({ name: "kernelSpawnsTest/mixed", systems: [fromKernel, fromMain] });
        await world.run(frame);
        expect(await valuesOf(world)).toEqual([100, 101, 102, 0, 1, 2, 3]);
        await world.run(frame);
        expect(await count(world, { required: [made] })).toBe(14);
        await world.dispose();
    });

    it("can be added to and removed from by commands later in the same tick", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(seed, { count: 3 });
        await world.run(spawnAndEdit);
        const entities = await select(world, { required: [made] });
        expect(entities).toHaveLength(3);
        expect(await readEach(world, entities, extra)).toEqual([0, 10, 20]);
        expect(await readEach(world, entities, value)).toEqual([0, 1, 2]);
        expect(await count(world, { required: [flag] })).toBe(0);
        added.seen = 0;
        await world.run(countAdded);
        expect(added.seen).toBe(3);
        await world.dispose();
    });

    it("write tuples, and the start of an object component left out", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(seed, { count: 2 });
        await world.run(withObjects);
        const entities = await select(world, { required: [made] });
        expect(await readEach(world, entities, position)).toEqual([[0, -0], [1, -1]]);
        expect(await readEach(world, entities, name)).toEqual([null, null]);
        expect(await readEach(world, entities, value)).toEqual([0, 1]);
        expect(await read(world, entities[0], index)).toBeNull();
        await world.dispose();
    });

    it("stage each run from empty batches", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(seed, { count: 3 });
        await world.run(fromKernel);
        await world.run(fromKernel);
        expect(await valuesOf(world)).toEqual([0, 1, 2, 0, 1, 2]);
        await world.dispose();
    });
});
