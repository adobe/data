import { afterEach, describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import type { Entity } from "../../entity/entity.js";
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
const tags = ["workersTest/tag-a", "workersTest/tag-b", "workersTest/tag-c", "workersTest/tag-d", "workersTest/tag-e", "workersTest/tag-f", "workersTest/tag-g"] as const;
const seconds = "workersTest/seconds";

declare module "../../component/types.js" {
    export interface Types {
        [position]: Vec2;
        [velocity]: Vec2;
        [target]: Entity;
        [offset]: number;
        [spawned]: true;
        [label]: string;
        "workersTest/tag-a": true;
        "workersTest/tag-b": true;
        "workersTest/tag-c": true;
        "workersTest/tag-d": true;
        "workersTest/tag-e": true;
        "workersTest/tag-f": true;
        "workersTest/tag-g": true;
    }
}
declare module "../../resource/types.js" {
    export interface Types {
        [seconds]: number;
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "workersTest/seed": true;
        "workersTest/integrate": true;
        "workersTest/split": true;
        "workersTest/follow": true;
        "workersTest/main": true;
        "workersTest/stamp": true;
        "workersTest/unlink": true;
        "workersTest/labels": true;
        "workersTest/scatter": true;
    }
}

Component.register(position, vec2);
Component.register(velocity, vec2);
Component.register(target, { type: "integer" });
Component.register(offset, { type: "number", precision: 1 });
Component.register(spawned, { const: true });
Component.register(label, { type: "string" });
for (const tag of tags) Component.register(tag, { const: true });

/** 64 entities in each of the 128 archetypes the tags combine into. */
const scatter = System.create({ name: "workersTest/scatter" }, (_, __, commands) => {
    for (let i = 0; i < 128 * 64; i++) {
        const values: { [key: string]: unknown } = { [position]: [i, 0], [velocity]: [1, i % 5] };
        tags.forEach((tag, bit) => { if (((i >> 6) & (1 << bit)) !== 0) values[tag] = true; });
        commands.spawn(values);
    }
});
Resource.register(seconds, { type: "number", default: 0.25 });

/** Spawns `args` moving entities, each following the one before it. */
const seed = System.create({ name: "workersTest/seed", args: { type: "integer" } }, (_, { args }, commands) => {
    let previous = commands.spawn({ [position]: [0, 0], [velocity]: [1, 0] });
    for (let i = 1; i < args; i++) {
        previous = commands.spawn({ [position]: [i, 0], [velocity]: [1, i % 7], [target]: previous });
    }
});

const integrate = System.create({
    name: "workersTest/integrate",
    kernel: true,
    query: { read: [position, velocity], write: [position] },
    resources: { read: [seconds] },
}, (row, context) => {
    const [x, y] = row[position];
    const [vx, vy] = row[velocity];
    row[position] = [x + vx * context[seconds], y + vy * context[seconds]];
});

/** Structural commands from workers: rows past a threshold spawn a marker and lose their velocity. */
const split = System.create({
    name: "workersTest/split",
    kernel: true,
    query: { read: [position], has: [velocity] },
    after: ["workersTest/integrate"],
}, (row, _, commands) => {
    const [x, y] = row[position];
    if (y > 3) {
        commands.spawn({ [position]: [x, -y], [spawned]: true });
        commands.remove(row.entity, velocity);
    }
});

/** Lookups from workers: offset by the distance to the target. */
const follow = System.create({
    name: "workersTest/follow",
    kernel: true,
    query: { read: [position, target], write: [offset] },
    lookup: { targets: { read: [position] } },
    after: ["workersTest/split"],
}, (row, { targets }) => {
    const other = targets(row[target]);
    const [x] = row[position];
    row[offset] = other === null ? -1 : x - other[position][0];
}, );

const main = System.composite({ name: "workersTest/main", systems: [integrate, split, follow] });

/** Every row writes the same entity, so only merge order decides which value survives. */
const stamp = System.create({
    name: "workersTest/stamp",
    kernel: true,
    args: { type: "integer" },
    query: { read: [position] },
}, (row, { args }, commands) => {
    const [x, y] = row[position];
    commands.add(args, { [offset]: x * 1000 + y });
});

/** Despawns entity 0, which is the resource entity since registration reserves it first. */
const unlink = System.create({
    name: "workersTest/unlink",
    kernel: true,
    query: { read: [target] },
}, (_, __, commands) => {
    commands.despawn(0);
});

const labels = System.create({
    name: "workersTest/labels",
    kernel: true,
    query: { read: [target], write: [offset] },
    // @ts-expect-error kernel lookups must read linear values; registration rejects it too, for untyped callers
    lookup: { named: { read: [label] } },
}, row => {
    row[offset] = 0;
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
    await world.systems.register(seed, main);
    await world.run(seed, 2000);
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

    it("keep tasks in order when a worker's ring overflows", async () => {
        const run = async (workers: number): Promise<unknown[]> => {
            const world = createWorld({ workers, minimumChunk: 64 });
            disposals.push(world);
            await world.systems.register(scatter, integrate);
            await world.run(scatter);
            for (let frame = 0; frame < 3; frame++) await world.run(integrate);
            return snapshot(world);
        };
        // One worker gets a task per archetype: 128, twice its ring.
        expect(await run(1)).toEqual(await run(0));
    });

    it("merge chunk commands in the same order as the main thread", async () => {
        const ordered = async (workers: number): Promise<unknown[]> => {
            const world = createWorld({ workers, minimumChunk: 64 });
            disposals.push(world);
            await world.systems.register(seed, main, stamp);
            await world.run(seed, 2000);
            for (let frame = 0; frame < 4; frame++) await world.run(main);
            const [first] = world.query.select([position]);
            await world.run(stamp, first);
            return [world.read.component(first, offset), world.query.select([position]).map(entity => world.read.component(entity, position))];
        };
        expect(await ordered(3)).toEqual(await ordered(0));
    });

    it("can't touch the resource entity", async () => {
        const world = createWorld({ workers: 2, minimumChunk: 64 });
        disposals.push(world);
        await world.systems.register(seed, integrate, unlink);
        await world.run(seed, 500);
        await world.run(unlink);
        await world.run(integrate);
        expect(world.read.resource(seconds)).toBe(0.25);
    });

    it("rejects kernel lookups of components outside linear memory", async () => {
        await expect(createWorld({ workers: 2 }).systems.register(labels)).rejects.toThrow('"workersTest/label", which isn\'t stored in linear memory');
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
            await world.systems.register(main);
            await world.dispose();
            expect(terminated).toHaveLength(2);
            expect(() => world.run(main)).toThrow("disposed");
        }
        finally {
            Worker.prototype.terminate = original;
        }
    });
});
