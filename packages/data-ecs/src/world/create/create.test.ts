import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Entity } from "../../entity/entity.js";
import { Resource } from "../../resource/resource.js";
import { gpuDevice } from "../../resources/gpu-device.js";
import { System } from "../../system/system.js";
import { World } from "../world.js";
import { attachKernel } from "./attach-kernel.js";

type Vec2 = readonly [number, number];

const position = "createTest/position";
const velocity = "createTest/velocity";
const label = "createTest/label";
const frozen = "createTest/frozen";
const spawnCount = "createTest/spawnCount";
const seen = "createTest/seen";
const marker = Symbol("createTest/marker");

declare module "@adobe/data-ecs" {
    export interface Components {
        [position]: { type: Vec2 };
        [velocity]: { type: number };
        [label]: { type: string };
        [frozen]: { type: true };
        [marker]: { type: number };
    }
    export interface Resources {
        [spawnCount]: { type: number };
        [seen]: { type: number };
    }
}

Component.register(position, { type: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } });
Component.register(velocity, { type: { type: "number" } });
Component.register(label, { type: { type: "string" } });
Component.register(frozen, { type: { const: true } });
Component.register(marker, { type: { type: "number" } });
Resource.register(spawnCount, { type: { type: "integer", default: 3 } });
Resource.register(seen, { type: { type: "integer", default: 0 } });

const spawn = System.create({
    name: "createTest/spawn",
    resources: { read: [spawnCount], changed: [spawnCount] },
}, ({ resources, commands }) => {
    for (let i = 0; i < resources[spawnCount]; i++) commands.spawn({ [position]: [i, 0], [velocity]: 1, [label]: `e${i}` });
});

const move = System.create({
    name: "createTest/move",
    components: { read: [velocity], write: [position], not: [frozen] },
    after: [spawn],
}, row => {
    const [x, y] = row[position];
    row[position] = [x, y + row[velocity]];
});

/** Counts rows whose position may have changed since it last ran. */
const watch = System.create({
    name: "createTest/watch",
    components: { changed: [position] },
    resources: { write: [seen] },
    after: [move],
}, (_, { resources }) => {
    resources[seen] += 1;
});

/** A kernel whose module can't be imported. */
const missing = attachKernel(
    System.create({ name: "createTest/missing", kernel: "cpu", components: { has: [velocity] } }, () => {}),
    { columns: [], shapes: [], resources: [], lookups: [], keys: [], url: "/@missing/kernel.js", program: null, reductions: [], reducedShapes: [] },
);

const main = System.composite({ name: "createTest/main", systems: [spawn, move, watch] });

const positions = (world: World): Vec2[] =>
    world.query.select([position], { order: { [position]: true } }).map(entity => world.read.component(entity, position) ?? [NaN, NaN]);

describe("World.create", () => {
    it("spawns once from a changed resource, then integrates", async () => {
        const world = World.create();
        await world.run(main);
        expect(positions(world)).toEqual([[0, 0], [1, 0], [2, 0]]);
        await world.run(main);
        expect(positions(world)).toEqual([[0, 1], [1, 1], [2, 1]]);
        expect(world.read.resource(spawnCount)).toBe(3);
    });

    it("reports each change to a system exactly once", async () => {
        const world = World.create();
        await world.run(main);
        // Spawned at the sync point, after watch ran: seen on the next run.
        expect(world.read.resource(seen)).toBe(0);
        await world.run(main);
        expect(world.read.resource(seen)).toBe(3);
        // Moved before watch in the last run, so already reported.
        await world.run(watch);
        expect(world.read.resource(seen)).toBe(3);
        await world.run(move);
        await world.run(watch);
        expect(world.read.resource(seen)).toBe(6);
    });

    it("applies the net structural change of a sync point", async () => {
        let first = Entity.none;
        let second = Entity.none;
        const edit = System.create({ name: "createTest/edit/net", input: { type: "object", properties: { action: { type: "string" } } } }, ({ input, commands }) => {
            if (input.action === "spawn") {
                first = commands.spawn({ [velocity]: 1 });
                second = commands.spawn({ [velocity]: 2 });
            }
            if (input.action === "toggle") {
                commands.add(first, { [frozen]: true });
                commands.remove(first, frozen);
                commands.add(second, { [velocity]: 5, [label]: "second" });
                commands.despawn(first);
                commands.add(first, { [label]: "dead" });
            }
        });
        const world = World.create();
        await world.run(edit, { action: "spawn" });
        expect(world.query.count([velocity])).toBe(2);
        await world.run(edit, { action: "toggle" });
        expect(world.read.entity(first, [velocity])).toBeNull();
        expect(world.read.entity(second, [velocity, label])).toEqual({ [velocity]: 5, [label]: "second" });
        expect(world.query.select([velocity])).toEqual([second]);
    });

    it("reuses a despawned index only after a sync point, with a new generation", async () => {
        const spawned: Entity[] = [];
        const edit = System.create({ name: "createTest/edit/reuse", input: { type: "object", properties: { action: { type: "string" } } } }, ({ input, commands }) => {
            if (input.action === "spawn") spawned.push(commands.spawn({ [velocity]: spawned.length }));
            else for (const entity of spawned) commands.despawn(entity);
        });
        const world = World.create();
        await world.run(edit, { action: "spawn" });
        await world.run(edit, { action: "despawn" });
        await world.run(edit, { action: "spawn" });
        const [old, reused] = spawned;
        expect(reused >>> 0).toBe(old >>> 0);
        expect(reused).not.toBe(old);
        expect(world.read.component(old, velocity)).toBeNull();
        expect(world.read.component(reused, velocity)).toBe(1);
    });

    it("keeps rows consistent across swap-removes and archetype growth", async () => {
        const spawned: Entity[] = [];
        const edit = System.create({ name: "createTest/edit/rows", input: { type: "object", properties: { action: { type: "string" } } } }, ({ input, commands }) => {
            if (input.action === "spawn") for (let i = 0; i < 100; i++) spawned.push(commands.spawn({ [velocity]: i, [label]: `${i}` }));
            else for (let i = 0; i < 100; i += 3) commands.remove(spawned[i], label);
        });
        const world = World.create();
        await world.run(edit, { action: "spawn" });
        await world.run(edit, { action: "remove" });
        spawned.forEach((entity, i) => {
            expect(world.read.component(entity, velocity)).toBe(i);
            expect(world.read.component(entity, label)).toBe(i % 3 === 0 ? null : `${i}`);
        });
        expect(world.query.count([label])).toBe(66);
    });

    it("hides the resource entity from queries and commands", async () => {
        const edit = System.create({ name: "createTest/edit/hidden", components: {} }, (row, { commands }) => {
            commands.despawn(row.entity);
        });
        const world = World.create();
        expect(world.query.count([])).toBe(0);
        await world.run(edit);
        expect(world.read.resource(seen)).toBe(0);
    });

    it("throws at creating a composite with an unordered conflict, naming nothing", () => {
        const push = System.create({ name: "createTest/push", components: { write: [position] } }, row => { row[position] = [0, 0]; });
        expect(() => System.composite({ name: "createTest/conflicted", systems: [move, push] })).toThrow('"createTest/move" and "createTest/push"');
        expect(() => System.composite({ name: "createTest/conflicted", systems: [move] })).not.toThrow();
    });

    it("gives a body's context only the kinds its declaration declares", async () => {
        let keys: string[] = [];
        const probe = System.create({ name: "createTest/keys", resources: { read: [seen] } }, context => {
            keys = Object.keys(context);
            void context.resources[seen];
        });
        const world = World.create();
        await world.run(probe);
        expect(keys).toEqual(["resources", "commands"]);
    });

    it("rejects a key listed in both read and write, since write already makes it readable", async () => {
        // @ts-expect-error write already makes it readable
        const both = System.create({ name: "createTest/both", components: { read: [velocity], write: [velocity] } }, row => { row[velocity] += 1; });
        await expect(World.create().run(both)).rejects.toThrow(`lists "createTest/velocity" in both components read and write`);
    });

    it("rejects a run when a system throws, still applying its commands", async () => {
        const fail = System.create({ name: "createTest/fail" }, ({ commands }) => {
            commands.spawn({ [velocity]: 1 });
            throw new Error("boom");
        });
        const world = World.create();
        await expect(world.run(fail)).rejects.toThrow("boom");
        expect(world.query.count([velocity])).toBe(1);
    });

    it("skips every row when a system's only filter is an unchanged resource", async () => {
        const count = System.create({
            name: "createTest/count",
            components: { has: [velocity] },
            resources: { write: [seen], changed: [spawnCount] },
        }, (_, { resources }) => {
            resources[seen] += 1;
        });
        const world = World.create();
        await world.run(spawn);
        await world.run(count);
        expect(world.read.resource(seen)).toBe(3);
        await world.run(count);
        expect(world.read.resource(seen)).toBe(3);
    });

    it("doesn't let a lookup match the resource entity", async () => {
        let found: object | null | undefined;
        const probe = System.create({ name: "createTest/probe", lookup: { any: {} } }, ({ lookup: { any } }) => {
            // The resource entity is entity 1, since index 0 is never an entity and registration reserves the next first.
            // @ts-expect-error an untyped caller can pass any number
            found = any(1);
        });
        const world = World.create();
        await world.run(probe);
        expect(found).toBeNull();
    });

    it("undoes a registration whose kernels fail to load, so the next run tries again", async () => {
        const world = World.create();
        await expect(world.run(missing)).rejects.toThrow();
        await expect(world.run(missing)).rejects.toThrow();
        await world.run(spawn);
    });

    it("sees a change moved into an older chunk by a swap-remove", async () => {
        const spawned: Entity[] = [];
        const edit = System.create({ name: "createTest/edit/swap", input: { type: "object", properties: { action: { type: "string" } } } }, ({ input, commands }) => {
            if (input.action === "spawn") for (let i = 0; i < 2100; i++) spawned.push(commands.spawn({ [velocity]: i }));
            else commands.despawn(spawned[5]);
        });
        const writer = System.create({ name: "createTest/writer", components: { write: [velocity] } }, row => {
            if (row[velocity] === 2099) row[velocity] = -1;
        });
        const changes: number[] = [];
        const observer = System.create({ name: "createTest/observer", components: { read: [velocity], changed: [velocity] } }, row => {
            changes.push(row[velocity]);
        });
        const world = World.create();
        await world.run(edit, { action: "spawn" });
        await world.run(observer);
        changes.length = 0;
        // The last row (in the third chunk) changes; then a despawn moves it into row 5, in the first chunk.
        await world.run(writer);
        await world.run(edit, { action: "despawn" });
        await world.run(observer);
        expect(changes).toEqual([-1]);
    });

    it("selects with where and order", async () => {
        const edit = System.create({ name: "createTest/edit/select" }, ({ commands }) => {
            for (let i = 0; i < 10; i++) commands.spawn({ [position]: [i % 3, i], [velocity]: i });
        });
        const world = World.create();
        await world.run(edit);
        const velocities = (entities: readonly Entity[]): (number | null)[] => entities.map(entity => world.read.component(entity, velocity));
        expect(velocities(world.query.select([velocity], { where: { [velocity]: { "<": 3 } } }))).toEqual([0, 1, 2]);
        expect(velocities(world.query.select([velocity], { where: { [velocity]: { ">=": 2, "!=": 4, "<": 6 } } }))).toEqual([2, 3, 5]);
        expect(velocities(world.query.select([position, velocity], { where: { [position]: [1, 4] } }))).toEqual([4]);
        expect(velocities(world.query.select([velocity], { order: { [velocity]: false } }))).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
        expect(velocities(world.query.select([position, velocity], { where: { [velocity]: { ">": 1 } }, order: { [position]: true } })))
            .toEqual([3, 6, 9, 4, 7, 2, 5, 8]);
        expect(world.query.count([velocity], { where: { [velocity]: { "<": 3 } } })).toBe(3);
    });

    it("spawns components named by symbols", async () => {
        let spawned = Entity.none;
        const edit = System.create({ name: "createTest/edit/symbols" }, ({ commands }) => {
            spawned = commands.spawn({ [velocity]: 2, [marker]: 7 });
        });
        const world = World.create();
        await world.run(edit);
        expect(world.read.entity(spawned, [velocity, marker])).toEqual({ [velocity]: 2, [marker]: 7 });
    });

    it("starts resources at values given at creation, in place of their defaults", async () => {
        const world = World.create({ [spawnCount]: 2 });
        expect(world.read.resource(spawnCount)).toBe(2);
        await world.run(spawn);
        expect(world.query.count([velocity])).toBe(2);
        expect(World.create().read.resource(spawnCount)).toBe(3);
        // @ts-expect-error resources takes only resource names
        expect(() => World.create({ [velocity]: 1 })).toThrow(`"createTest/velocity" isn't a registered resource`);
    });

    it("has the gpuDevice resource, null without a device", async () => {
        await using world = World.create();
        expect(world.read.resource(gpuDevice)).toBeNull();
        let seen: unknown = undefined;
        await world.run(System.create({ name: "createTest/readDevice", resources: { read: [gpuDevice] } }, ({ resources }) => { seen = resources[gpuDevice]; }));
        expect(seen).toBeNull();
    });

    it("accepts a system declared again the same, as a module evaluated again declares it, and rejects a different one", async () => {
        const first = System.create({ name: "createTest/named", resources: { write: [seen] } }, ({ resources }) => { resources[seen] = 1; });
        const again = System.create({ name: "createTest/named", resources: { write: [seen] } }, ({ resources }) => { resources[seen] = 2; });
        expect(() => System.create({ name: "createTest/named" }, () => {})).toThrow('A different system, rule or finalizer named "createTest/named" already exists');
        await using world = World.create();
        await world.run(first);
        await world.run(again);
        expect(world.read.resource(seen)).toBe(2);
    });

    it("refuses runs as soon as dispose is called", async () => {
        const world = World.create();
        void world.dispose();
        await expect(world.run(main)).rejects.toThrow("disposed");
    });
});
