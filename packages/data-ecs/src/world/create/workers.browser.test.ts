import { afterEach, describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Entity } from "../../entity/entity.js";
import { Resource } from "../../resource/resource.js";
import type { Schema } from "../../schema/schema.js";
import { System } from "../../system/system.js";
import type { World } from "../world.js";
import { createWorld } from "./create.js";

type Vec2 = readonly [number, number];
const vec2: Schema.ForType<Vec2> = { type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2 };

const position = "workersTest/position";
const velocity = "workersTest/velocity";
const target = "workersTest/target";
const offset = "workersTest/offset";
const spawned = "workersTest/spawned";
const label = "workersTest/label";
const tags = ["workersTest/tag-a", "workersTest/tag-b", "workersTest/tag-c", "workersTest/tag-d", "workersTest/tag-e", "workersTest/tag-f", "workersTest/tag-g", "workersTest/tag-h", "workersTest/tag-i"] as const;
const seconds = "workersTest/seconds";

declare module "@adobe/data-ecs" {
    export interface Components {
        [position]: { type: Vec2 };
        [velocity]: { type: Vec2 };
        [target]: { type: Entity };
        [offset]: { type: number };
        [spawned]: { type: true };
        [label]: { type: string };
        "workersTest/tag-a": { type: true };
        "workersTest/tag-b": { type: true };
        "workersTest/tag-c": { type: true };
        "workersTest/tag-d": { type: true };
        "workersTest/tag-e": { type: true };
        "workersTest/tag-f": { type: true };
        "workersTest/tag-g": { type: true };
        "workersTest/tag-h": { type: true };
        "workersTest/tag-i": { type: true };
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
Component.register(label, { type: { type: "string" } });
for (const tag of tags) Component.register(tag, { type: { const: true } });

/** 64 entities in each of the 512 archetypes the tags combine into. */
const scatter = System.create({ name: "workersTest/scatter" }, ({ commands }) => {
    for (let i = 0; i < 512 * 64; i++) {
        const values: { [key: string]: unknown } = { [position]: [i, 0], [velocity]: [1, i % 5] };
        tags.forEach((tag, bit) => { if (((i >> 6) & (1 << bit)) !== 0) values[tag] = true; });
        commands.spawn(values);
    }
});
Resource.register(seconds, { type: { type: "number", default: 0.25 } });

/** Spawns `count` moving entities, each following the one before it. */
const seed = System.create({ name: "workersTest/seed", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    let previous = commands.spawn({ [position]: [0, 0], [velocity]: [1, 0] });
    for (let i = 1; i < input.count; i++) {
        previous = commands.spawn({ [position]: [i, 0], [velocity]: [1, i % 7], [target]: previous });
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
        commands.spawn({ [position]: [x, -y], [spawned]: true });
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
    commands.add(input.entity, { [offset]: x * 1000 + y });
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

const labels = System.create({
    name: "workersTest/labels",
    kernel: "cpu",
    components: { read: [target], write: [offset] },
    // @ts-expect-error kernel lookups must read linear values; registration rejects it too, for untyped callers
    lookup: { named: { read: [label] } },
}, (row, { lookup: { named } }) => {
    const found = named(row[target]);
    row[offset] = found === null ? 0 : +found[label];
});

const disposals: World[] = [];
afterEach(async () => {
    for (const world of disposals.splice(0)) await world.dispose();
});

/** Every entity's values, in a canonical order, since entity ids depend on reservation interleaving. */
const snapshot = (world: World): unknown[] => {
    const rows = world.query.select([position]).map(entity => [
        world.read.component(entity, position),
        world.read.component(entity, velocity),
        world.read.component(entity, offset),
        world.read.component(entity, spawned),
    ]);
    return rows.map(row => JSON.stringify(row)).sort();
};

const simulate = async (workers: number, wasm = true, simd = false): Promise<unknown[]> => {
    const world = createWorld({ workers, minimumChunk: 64, wasm, simd });
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
        const run = async (workers: number): Promise<unknown[]> => {
            const world = createWorld({ workers, minimumChunk: 64 });
            disposals.push(world);
            await world.run(scatter);
            for (let frame = 0; frame < 3; frame++) await world.run(integrate);
            return snapshot(world);
        };
        // One worker gets a task per archetype: 512, eight times its ring and twice the claim counters.
        expect(await run(1)).toEqual(await run(0));
    });

    it("merge chunk commands in the same order as the main thread", async () => {
        const ordered = async (workers: number): Promise<unknown[]> => {
            const world = createWorld({ workers, minimumChunk: 64 });
            disposals.push(world);
            await world.run(seed, { count: 2000 });
            for (let frame = 0; frame < 4; frame++) await world.run(main);
            const [first] = world.query.select([position]);
            await world.run(stamp, { entity: first });
            return [world.read.component(first, offset), world.query.select([position]).map(entity => world.read.component(entity, position))];
        };
        expect(await ordered(3)).toEqual(await ordered(0));
    });

    it("can't touch the resource entity", async () => {
        const world = createWorld({ workers: 2, minimumChunk: 64 });
        disposals.push(world);
        await world.run(seed, { count: 500 });
        await world.run(unlink);
        await world.run(integrate);
        expect(world.read.resource(seconds)).toBe(0.25);
    });

    it("rejects kernel lookups of components outside linear memory", async () => {
        await expect(createWorld({ workers: 2 }).run(labels)).rejects.toThrow('"workersTest/label", which isn\'t stored in linear memory');
    });

    it("are terminated by dispose", async () => {
        const terminated: Worker[] = [];
        const original = Worker.prototype.terminate;
        Worker.prototype.terminate = function (this: Worker) {
            terminated.push(this);
            original.call(this);
        };
        try {
            const world = createWorld({ workers: 2 });
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
