import { afterEach, describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Resource } from "../../interface/resource/resource.js";
import type { Schema } from "../../interface/schema/schema.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { read, readEach, readResource, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";

type Vec2 = readonly [number, number];
const vec2: Schema.ForType<Vec2> = { type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2 };

const position = Symbol("workersTest/position");
const velocity = Symbol("workersTest/velocity");
const target = Symbol("workersTest/target");
const offset = Symbol("workersTest/offset");
const spawned = Symbol("workersTest/spawned");
const tagA = Symbol("workersTest/tag-a");
const tagB = Symbol("workersTest/tag-b");
const tagC = Symbol("workersTest/tag-c");
const tagD = Symbol("workersTest/tag-d");
const tagE = Symbol("workersTest/tag-e");
const tagF = Symbol("workersTest/tag-f");
const tagG = Symbol("workersTest/tag-g");
const tagH = Symbol("workersTest/tag-h");
const tagI = Symbol("workersTest/tag-i");
const tags = [tagA, tagB, tagC, tagD, tagE, tagF, tagG, tagH, tagI] as const;
const seconds = Symbol("workersTest/seconds");

declare module "@adobe/data-ecs" {
    export interface Components {
        [position]: { type: Vec2 };
        [velocity]: { type: Vec2 };
        [target]: { type: Entity };
        [offset]: { type: number };
        [spawned]: { type: true };
        [tagA]: { type: true };
        [tagB]: { type: true };
        [tagC]: { type: true };
        [tagD]: { type: true };
        [tagE]: { type: true };
        [tagF]: { type: true };
        [tagG]: { type: true };
        [tagH]: { type: true };
        [tagI]: { type: true };
    }
    export interface Resources {
        [seconds]: { type: number };
    }
}

Component.register(position, { type: vec2 });
Component.register(velocity, { type: vec2 });
Component.register(target, { type: Entity.schema });
Component.register(offset, { type: { type: "number", precision: 1 } });
Component.register(spawned, { type: { const: true } });
for (const tag of tags) Component.register(tag, { type: { const: true } });

/** 64 entities in each of the 512 archetypes the tags combine into. */
const scatter = System.create({ name: "workersTest/scatter" }, ({ commands }) => {
    for (let i = 0; i < 512 * 64; i++) {
        const components: (typeof position | typeof velocity | (typeof tags)[number])[] = [position, velocity];
        tags.forEach((tag, bit) => { if (((i >> 6) & (1 << bit)) !== 0) components.push(tag); });
        commands.spawn(components)({ [position]: [i, 0], [velocity]: [1, i % 5] });
    }
});
Resource.register(seconds, { type: { type: "number", default: 0.25 } });

/** Spawns `count` moving entities, each following the one before it. */
const seed = System.create({ name: "workersTest/seed", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    let previous = commands.spawn([position, velocity])({ [position]: [0, 0], [velocity]: [1, 0] });
    for (let i = 1; i < input.count; i++) {
        previous = commands.spawn([position, velocity, target])({ [position]: [i, 0], [velocity]: [1, i % 7], [target]: previous });
    }
});

const integrate = System.create({
    name: "workersTest/integrate",
    kernel: "cpu",
    components: { read: [velocity], write: [position] },
    resources: { read: [seconds] },
}, (row, { resources }) => {
    const [x, y] = row[position];
    const [vx, vy] = row[velocity];
    row[position] = [x + vx * resources[seconds], y + vy * resources[seconds]];
});

/** Structural commands from workers: rows past a threshold spawn a marker and lose their velocity. */
const split = System.create({
    name: "workersTest/split",
    kernel: "cpu",
    components: { read: [position], has: [velocity] },
    after: [integrate],
}, (row, { commands }) => {
    const [x, y] = row[position];
    if (y > 3) {
        commands.spawn([position, spawned])({ [position]: [x, -y], [spawned]: true });
        commands.remove(row.entity, velocity);
    }
});

/** Lookups from workers: offset by the distance to the target. */
const follow = System.create({
    name: "workersTest/follow",
    kernel: "cpu",
    components: { read: [position, target], write: [offset] },
    lookup: { targets: { read: [position] } },
    after: [split],
}, (row, { lookup: { targets } }) => {
    const other = targets(row[target]);
    const [x] = row[position];
    row[offset] = other === null ? -1 : x - other[position][0];
}, );

const main = System.composite({ name: "workersTest/main", systems: [integrate, split, follow] });

/** Every row writes the same entity, so only merge order decides which value survives. */
const stamp = System.create({
    name: "workersTest/stamp",
    kernel: "cpu",
    input: { type: "object", properties: { entity: Entity.schema } },
    components: { read: [position] },
}, (row, { input, commands }) => {
    const [x, y] = row[position];
    commands.add(input.entity, offset, x * 1000 + y);
});

/** Despawns entity 1, the resource entity, since index 0 is never an entity and registration reserves the next first. */
const unlink = System.create({
    name: "workersTest/unlink",
    kernel: "cpu",
    components: { has: [target] },
}, (_, { commands }) => {
    // @ts-expect-error an untyped caller can pass any number
    commands.despawn(1);
});

/** Archetypes in this order: 5 rows the main thread runs, 1,000 that workers run, then 10 more on the main thread. */
const sources = System.create({ name: "workersTest/sources" }, ({ commands }) => {
    for (let i = 0; i < 5; i++) commands.spawn([offset, tagD])({ [offset]: i });
    for (let i = 5; i < 1_005; i++) commands.spawn([offset, tagA])({ [offset]: i });
    for (let i = 1_005; i < 1_015; i++) commands.spawn([offset, tagB])({ [offset]: i });
});

/** A spawn per row, from wherever its chunk runs; with `edit`, each spawn is also added to and removed from. */
const emit = System.create({
    name: "workersTest/emit",
    kernel: "cpu",
    input: { type: "object", properties: { edit: { type: "boolean" } } },
    components: { read: [offset], not: [spawned] },
}, (row, { input, commands }) => {
    const entity = commands.spawn([position, spawned, tagC])({ [position]: [row[offset], -row[offset]] });
    if (input.edit) {
        commands.add(entity, velocity, [row[offset], 1]);
        commands.remove(entity, tagC);
    }
});

const emitted = { seen: 0 };
const countEmitted = System.create({ name: "workersTest/countEmitted", components: { added: [position], has: [spawned] } }, () => { emitted.seen++; });

const disposals: World[] = [];
afterEach(async () => {
    for (const world of disposals.splice(0)) await world.dispose();
});

/** Every entity's values, in a canonical order, since entity ids depend on reservation interleaving. */
const snapshot = async (world: World): Promise<unknown[]> => {
    const rows = await Promise.all((await select(world, { required: [position] })).map(entity => Promise.all([
        read(world, entity, position),
        read(world, entity, velocity),
        read(world, entity, offset),
        read(world, entity, spawned),
    ])));
    return rows.map(row => JSON.stringify(row)).sort();
};

const simulate = async (count: number, wasm = true, simd = false): Promise<unknown[]> => {
    const world = createWorld({ [workers]: count }, { minimumChunk: 64, wasm, simd });
    disposals.push(world);
    await world.run(seed, { count: 2000 });
    for (let frame = 0; frame < 12; frame++) await world.run(main);
    return snapshot(world);
};

describe("workers", () => {
    it("give the same results as the main thread alone", async () => {
        // JS kernels on the main thread alone, against WASM kernels (where a kernel has one) on workers.
        const alone = await simulate(0, false);
        expect(alone.some(row => String(row).includes("true"))).toBe(true);
        let tasks = 0;
        const original = Worker.prototype.postMessage;
        Worker.prototype.postMessage = function (this: Worker, message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
            if (typeof message === "object" && message !== null && Reflect.get(message, "kind") === "run") tasks++;
            original.call(this, message, transfer as StructuredSerializeOptions);
        };
        try {
            expect(await simulate(3)).toEqual(alone);
        }
        finally {
            Worker.prototype.postMessage = original;
        }
        // Archetypes of at least 64 rows ran on the workers every frame.
        expect(tasks).toBeGreaterThanOrEqual(12 * 3);
    });

    it("give the same SIMD results as the main thread alone, since chunks start on 16-row boundaries", async () => {
        expect(await simulate(3, true, true)).toEqual(await simulate(0, true, true));
    });

    it("keep tasks in order when a worker's ring overflows, and split evenly once every claim counter is in flight", async () => {
        const run = async (count: number): Promise<unknown[]> => {
            const world = createWorld({ [workers]: count }, { minimumChunk: 64 });
            disposals.push(world);
            await world.run(scatter);
            for (let frame = 0; frame < 3; frame++) await world.run(integrate);
            return snapshot(world);
        };
        // One worker gets a task per archetype: 512, eight times its ring and twice the claim counters.
        expect(await run(1)).toEqual(await run(0));
    });

    it("merge chunk commands in the same order as the main thread", async () => {
        const ordered = async (count: number): Promise<unknown[]> => {
            const world = createWorld({ [workers]: count }, { minimumChunk: 64 });
            disposals.push(world);
            await world.run(seed, { count: 2000 });
            for (let frame = 0; frame < 4; frame++) await world.run(main);
            const [first] = await select(world, { required: [position] });
            await world.run(stamp, { entity: first });
            return [await read(world, first, offset), await readEach(world, await select(world, { required: [position] }), position)];
        };
        expect(await ordered(3)).toEqual(await ordered(0));
    });

    it("stage kernel spawns from every worker and the main thread in chunk order, whatever the worker count", async () => {
        const spawnsWith = async (count: number, edit: boolean): Promise<unknown[]> => {
            const world = createWorld({ [workers]: count }, { minimumChunk: 64 });
            disposals.push(world);
            await world.run(sources);
            await world.run(emit, { edit });
            emitted.seen = 0;
            await world.run(countEmitted);
            await world.run(countEmitted);
            const entities = await select(world, { required: [spawned] });
            return [emitted.seen, await readEach(world, entities, position), await readEach(world, entities, velocity), await readEach(world, entities, tagC)];
        };
        const rows = Array.from({ length: 1_015 }, (_, i) => i);
        // Storage order is the spawns' order, row by row over the archetypes, wherever each chunk ran.
        const alone = await spawnsWith(0, false);
        expect(alone).toEqual([1_015, rows.map(i => [i, -i]), rows.map(() => null), rows.map(() => true)]);
        for (const count of [1, 2, 7]) expect(await spawnsWith(count, false)).toEqual(alone);
        // Spawned entities moved in the same sync point arrive in the order of the commands that moved them.
        const edited = await spawnsWith(0, true);
        expect(edited).toEqual([1_015, rows.map(i => [i, -i]), rows.map(i => [i, 1]), rows.map(() => null)]);
        for (const count of [1, 2, 7]) expect(await spawnsWith(count, true)).toEqual(edited);
    });

    it("can't touch the resource entity", async () => {
        const world = createWorld({ [workers]: 2 }, { minimumChunk: 64 });
        disposals.push(world);
        await world.run(seed, { count: 500 });
        await world.run(unlink);
        await world.run(integrate);
        expect(await readResource(world, seconds)).toBe(0.25);
    });

    it("are terminated by dispose", async () => {
        const terminated: Worker[] = [];
        const original = Worker.prototype.terminate;
        Worker.prototype.terminate = function (this: Worker) {
            terminated.push(this);
            original.call(this);
        };
        try {
            const world = createWorld({ [workers]: 2 });
            // Workers start with the first kernel.
            await world.run(main);
            await world.dispose();
            expect(terminated).toHaveLength(2);
            await expect(world.run(main)).rejects.toThrow("disposed");
        }
        finally {
            Worker.prototype.terminate = original;
        }
    });
});
