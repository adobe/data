import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import type { Entity } from "../../entity/entity.js";
import { Resource } from "../../resource/resource.js";
import { System } from "../../system/system.js";
import { World } from "../world.js";

type Vec2 = readonly [number, number];

const position = "createTest/position";
const velocity = "createTest/velocity";
const label = "createTest/label";
const frozen = "createTest/frozen";
const spawnCount = "createTest/spawnCount";
const seen = "createTest/seen";

declare module "../../component/types.js" {
    export interface Types {
        [position]: Vec2;
        [velocity]: number;
        [label]: string;
        [frozen]: true;
    }
}
declare module "../../resource/types.js" {
    export interface Types {
        [spawnCount]: number;
        [seen]: number;
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "createTest/spawn": true;
        "createTest/move": true;
        "createTest/watch": true;
        "createTest/push": true;
        "createTest/main": true;
        "createTest/fail": true;
        "createTest/edit": true;
    }
}

Component.register(position, { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 });
Component.register(velocity, { type: "number" });
Component.register(label, { type: "string" });
Component.register(frozen, { const: true });
Resource.register(spawnCount, { type: "integer", default: 3 });
Resource.register(seen, { type: "integer", default: 0 });

const spawn = System.create({
    name: "createTest/spawn",
    resources: { read: [spawnCount], changed: [spawnCount] },
}, (_, context, commands) => {
    for (let i = 0; i < context[spawnCount]; i++) commands.spawn({ [position]: [i, 0], [velocity]: 1, [label]: `e${i}` });
});

const move = System.create({
    name: "createTest/move",
    query: { read: [position, velocity], write: [position], not: [frozen] },
    after: ["createTest/spawn"],
}, row => {
    const [x, y] = row[position];
    row[position] = [x, y + row[velocity]];
});

/** Counts rows whose position may have changed since it last ran. */
const watch = System.create({
    name: "createTest/watch",
    query: { read: [position], changed: [position] },
    resources: { read: [seen], write: [seen] },
    after: ["createTest/move"],
}, (_, context) => {
    context[seen] += 1;
});

const main = System.composite({ name: "createTest/main", systems: [spawn, move, watch] });

const positions = (world: World): Vec2[] =>
    world.query.select([position], { order: { [position]: true } }).map(entity => world.read.component(entity, position) ?? [NaN, NaN]);

describe("World.create", () => {
    it("spawns once from a changed resource, then integrates", async () => {
        const world = await World.create({ systems: [main] });
        await world.run(main);
        expect(positions(world)).toEqual([[0, 0], [1, 0], [2, 0]]);
        await world.run(main);
        expect(positions(world)).toEqual([[0, 1], [1, 1], [2, 1]]);
        expect(world.read.resource(spawnCount)).toBe(3);
    });

    it("reports each change to a system exactly once", async () => {
        const world = await World.create({ systems: [main] });
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
        let first: Entity = -1;
        let second: Entity = -1;
        const edit = System.create({ name: "createTest/edit", args: { type: "string" } }, (_, { args }, commands) => {
            if (args === "spawn") {
                first = commands.spawn({ [velocity]: 1 });
                second = commands.spawn({ [velocity]: 2 });
            }
            if (args === "toggle") {
                commands.add(first, { [frozen]: true });
                commands.remove(first, frozen);
                commands.add(second, { [velocity]: 5, [label]: "second" });
                commands.despawn(first);
                commands.add(first, { [label]: "dead" });
            }
        });
        const world = await World.create({ systems: [edit] });
        await world.run(edit, "spawn");
        expect(world.query.count([velocity])).toBe(2);
        await world.run(edit, "toggle");
        expect(world.read.entity(first, [velocity])).toBeNull();
        expect(world.read.entity(second, [velocity, label])).toEqual({ [velocity]: 5, [label]: "second" });
        expect(world.query.select([velocity])).toEqual([second]);
    });

    it("reuses a despawned index only after a sync point, with a new generation", async () => {
        const spawned: Entity[] = [];
        const edit = System.create({ name: "createTest/edit", args: { type: "string" } }, (_, { args }, commands) => {
            if (args === "spawn") spawned.push(commands.spawn({ [velocity]: spawned.length }));
            else for (const entity of spawned) commands.despawn(entity);
        });
        const world = await World.create({ systems: [edit] });
        await world.run(edit, "spawn");
        await world.run(edit, "despawn");
        await world.run(edit, "spawn");
        const [old, reused] = spawned;
        expect(reused >>> 0).toBe(old >>> 0);
        expect(reused).not.toBe(old);
        expect(world.read.component(old, velocity)).toBeNull();
        expect(world.read.component(reused, velocity)).toBe(1);
    });

    it("keeps rows consistent across swap-removes and archetype growth", async () => {
        const spawned: Entity[] = [];
        const edit = System.create({ name: "createTest/edit", args: { type: "string" } }, (_, { args }, commands) => {
            if (args === "spawn") for (let i = 0; i < 100; i++) spawned.push(commands.spawn({ [velocity]: i, [label]: `${i}` }));
            else for (let i = 0; i < 100; i += 3) commands.remove(spawned[i], label);
        });
        const world = await World.create({ systems: [edit] });
        await world.run(edit, "spawn");
        await world.run(edit, "remove");
        spawned.forEach((entity, i) => {
            expect(world.read.component(entity, velocity)).toBe(i);
            expect(world.read.component(entity, label)).toBe(i % 3 === 0 ? null : `${i}`);
        });
        expect(world.query.count([label])).toBe(66);
    });

    it("hides the resource entity from queries and commands", async () => {
        const edit = System.create({ name: "createTest/edit", query: {}, resources: { read: [seen] } }, (row, _, commands) => {
            commands.despawn(row.entity);
        });
        const world = await World.create({ systems: [edit] });
        expect(world.query.count([])).toBe(0);
        await world.run(edit);
        expect(world.read.resource(seen)).toBe(0);
    });

    it("throws at registration on an unordered conflict", async () => {
        const push = System.create({ name: "createTest/push", query: { write: [position] } }, () => {});
        const conflicted = System.composite({ name: "createTest/main", systems: [move, push] });
        await expect(World.create({ systems: [conflicted] })).rejects.toThrow('"createTest/move" and "createTest/push"');
    });

    it("rejects a run when a system throws, still applying its commands", async () => {
        const fail = System.create({ name: "createTest/fail" }, (_, __, commands) => {
            commands.spawn({ [velocity]: 1 });
            throw new Error("boom");
        });
        const world = await World.create({ systems: [fail] });
        await expect(world.run(fail)).rejects.toThrow("boom");
        expect(world.query.count([velocity])).toBe(1);
    });

    it("throws for an unregistered system and after dispose", async () => {
        const world = World.create();
        expect(() => world.run(main)).toThrow("isn't registered");
        await world.dispose();
        await expect(world.systems.register(main)).rejects.toThrow("disposed");
    });
});
