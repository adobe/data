import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import type { Entity } from "../../entity/entity.js";
import type { Schema } from "../../schema/schema.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

type Vec3 = readonly [number, number, number];
const vec3: Schema.ForType<Vec3> = { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 };
const position = "batchesTest/position";
const score = "batchesTest/score";
const name = "batchesTest/name";
const tag = "batchesTest/tag";
declare module "../../component/types.js" {
    export interface Types {
        [position]: Vec3;
        [score]: number;
        [name]: string;
        [tag]: true;
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "batchesTest/spawn": true;
        "batchesTest/early": true;
        "batchesTest/late": true;
        "batchesTest/same": true;
        "batchesTest/edit": true;
    }
}
Component.register(position, vec3);
Component.register(score, { type: "number", precision: 1 });
Component.register(name, { type: "string" });
Component.register(tag, { const: true });

describe("staged spawns", () => {
    it("are seen once by `added` observers in earlier, the same and later tiers, and not before the sync point", async () => {
        const seen = { early: 0, same: 0, late: 0 };
        const spawned: Entity[] = [];
        const early = System.create({ name: "batchesTest/early", query: { read: [score], added: [score] } }, () => { seen.early++; });
        const spawn = System.create({ name: "batchesTest/spawn", after: ["batchesTest/early"] }, (_, __, commands) => {
            if (spawned.length > 0) return;
            for (let i = 0; i < 100; i++) spawned.push(commands.spawn({ [position]: [i, i, i], [score]: i, [name]: `${i}`, [tag]: true }));
        });
        const same = System.create({ name: "batchesTest/same", query: { read: [score], added: [score] }, after: ["batchesTest/early"] }, () => { seen.same++; });
        const late = System.create({ name: "batchesTest/late", query: { read: [score], added: [score] }, after: ["batchesTest/spawn", "batchesTest/same"] }, () => { seen.late++; });
        const frame = System.composite({ name: "batchesTest/edit", systems: [early, spawn, same, late] });
        const world = createWorld({ workers: 0 });
        await world.systems.register(frame);
        await world.run(frame);
        // Nothing saw the spawns during their own run.
        expect(seen).toEqual({ early: 0, same: 0, late: 0 });
        await world.run(frame);
        await world.run(frame);
        expect(seen).toEqual({ early: 100, same: 100, late: 100 });
        expect(spawned.map(entity => world.read.entity(entity, [position, score, name, tag]))).toEqual(
            spawned.map((_, i) => ({ [position]: [i, i, i], [score]: i, [name]: `${i}`, [tag]: true })));
        await world.dispose();
    });

    it("can be changed, removed, re-added or despawned in the run that spawns them", async () => {
        const spawned: Entity[] = [];
        const edit = System.create({ name: "batchesTest/edit" }, (_, __, commands) => {
            for (let i = 0; i < 4; i++) spawned.push(commands.spawn({ [score]: i, [name]: `${i}` }));
            commands.add(spawned[0], { [score]: 10 });
            commands.remove(spawned[1], name);
            commands.remove(spawned[2], name);
            commands.add(spawned[2], { [name]: "again" });
            commands.despawn(spawned[3]);
        });
        const world = createWorld({ workers: 0 });
        await world.systems.register(edit);
        await world.run(edit);
        expect(spawned.map(entity => [world.read.component(entity, score), world.read.component(entity, name)])).toEqual([[10, "0"], [1, null], [2, "again"], [null, null]]);
        expect(world.query.count([score])).toBe(3);
        await world.dispose();
    });

    it("keep the spawns before a value that can't be written, and release that one's entity", async () => {
        const spawned: Entity[] = [];
        let poison = true;
        const spawn = System.create({ name: "batchesTest/spawn" }, (_, __, commands) => {
            for (let i = 0; i < 3; i++) spawned.push(commands.spawn({ [position]: [i, 0, 0], [score]: i }));
            // A symbol can't convert to a number, so writing it throws.
            if (poison) commands.spawn({ [position]: [0, 0, 0], [score]: Symbol("x") as unknown as number });
        });
        const world = createWorld({ workers: 0 });
        await world.systems.register(spawn);
        await expect(world.run(spawn)).rejects.toThrow();
        expect(spawned.map(entity => world.read.component(entity, score))).toEqual([0, 1, 2]);
        poison = false;
        await world.run(spawn);
        expect(world.query.count([score])).toBe(6);
        expect(spawned.map(entity => world.read.component(entity, score))).toEqual([0, 1, 2, 0, 1, 2]);
        await world.dispose();
    });

    it("spawn through a spawner, and through commands when a value is missing", async () => {
        const spawned: Entity[] = [];
        const spawn = System.create({ name: "batchesTest/spawn" }, (_, __, commands) => {
            const make = commands.spawner([position, score, tag]);
            for (let i = 0; i < 50; i++) spawned.push(make({ [position]: [i, i, i], [score]: i, [tag]: true }));
            // Leaving a component out goes through commands, so the entity has only what it names.
            spawned.push(make({ [position]: [9, 9, 9], [score]: undefined as unknown as number, [tag]: true }));
        });
        const world = createWorld({ workers: 0 });
        await world.systems.register(spawn);
        await world.run(spawn);
        expect(spawned.slice(0, 50).map(entity => world.read.entity(entity, [position, score, tag]))).toEqual(
            spawned.slice(0, 50).map((_, i) => ({ [position]: [i, i, i], [score]: i, [tag]: true })));
        expect([world.read.component(spawned[50], position), world.read.component(spawned[50], score)]).toEqual([[9, 9, 9], null]);
        await world.dispose();
    });

    it("stage without generated code where it isn't allowed", async () => {
        const original = globalThis.Function;
        // A content security policy without `unsafe-eval` makes `new Function` throw.
        globalThis.Function = function () { throw new EvalError("blocked"); } as unknown as FunctionConstructor;
        try {
            const spawned: Entity[] = [];
            const spawn = System.create({ name: "batchesTest/spawn" }, (_, __, commands) => {
                for (let i = 0; i < 20; i++) spawned.push(commands.spawn({ [position]: [i, 0, 1], [score]: i, [name]: `${i}`, [tag]: true }));
            });
            const world = createWorld({ workers: 0 });
            await world.systems.register(spawn);
            await world.run(spawn);
            expect(spawned.map(entity => world.read.entity(entity, [position, score, name]))).toEqual(
                spawned.map((_, i) => ({ [position]: [i, 0, 1], [score]: i, [name]: `${i}` })));
            await world.dispose();
        }
        finally {
            globalThis.Function = original;
        }
    });
});
