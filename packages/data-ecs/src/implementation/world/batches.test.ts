import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import type { Schema } from "../../interface/schema/schema.js";
import { System } from "../../interface/system/system.js";
import { count, read, readEach, readEntity } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";
import { toPromise } from "../../interface/observe/to-promise.js";
import { createBuffer } from "./buffer.js";
import { createCommands } from "./commands.js";
import { createState } from "./state.js";

type Vec3 = readonly [number, number, number];
const vec3 = { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } as const satisfies Schema;
const position = Symbol("batchesTest/position");
const score = Symbol("batchesTest/score");
const name = Symbol("batchesTest/name");
const tag = Symbol("batchesTest/tag");
declare module "@adobe/data-ecs" {
    export interface Components {
        [position]: typeof positionTraits;
        [score]: typeof scoreTraits;
        [name]: typeof nameTraits;
        [tag]: typeof tagTraits;
    }
}
const positionTraits = Component.register(position, { type: vec3 });
const scoreTraits = Component.register(score, { type: { type: "number", precision: 1 } });
const nameTraits = Component.register(name, { type: { type: "string" } });
const tagTraits = Component.register(tag, { type: { const: true } });

describe("staged spawns", () => {
    it("are seen once by `added` observers in earlier, the same and later tiers, and not before the sync point", async () => {
        const seen = { early: 0, same: 0, late: 0 };
        const spawned: Entity[] = [];
        const early = System.create({ name: "batchesTest/early", components: { added: [score] } }, () => { seen.early++; });
        const spawn = System.create({ name: "batchesTest/spawn", after: [early] }, ({ commands }) => {
            if (spawned.length > 0) return;
            for (let i = 0; i < 100; i++) spawned.push(commands.spawn([position, score, name, tag])({ [position]: [i, i, i], [score]: i, [name]: `${i}`, [tag]: true }));
        });
        const same = System.create({ name: "batchesTest/same", components: { added: [score] }, after: [early] }, () => { seen.same++; });
        const late = System.create({ name: "batchesTest/late", components: { added: [score] }, after: [spawn, same] }, () => { seen.late++; });
        const frame = System.create({ name: "batchesTest/edit", systems: [early, spawn, same, late] });
        const world = createWorld({ [workers]: 0 });
        await world.run(frame);
        // Nothing saw the spawns during their own run.
        expect(seen).toEqual({ early: 0, same: 0, late: 0 });
        await world.run(frame);
        await world.run(frame);
        expect(seen).toEqual({ early: 100, same: 100, late: 100 });
        expect(await Promise.all(spawned.map(entity => readEntity(world, entity, [position, score, name, tag])))).toEqual(
            spawned.map((_, i) => ({ [position]: [i, i, i], [score]: i, [name]: `${i}`, [tag]: true })));
        await world.dispose();
    });

    it("can be changed, removed, re-added or despawned in the run that spawns them", async () => {
        const spawned: Entity[] = [];
        const edit = System.create({ name: "batchesTest/edit/2" }, ({ commands }) => {
            for (let i = 0; i < 4; i++) spawned.push(commands.spawn([score, name])({ [score]: i, [name]: `${i}` }));
            commands.add(spawned[0], score, 10);
            commands.remove(spawned[1], name);
            commands.remove(spawned[2], name);
            commands.add(spawned[2], name, "again");
            commands.despawn(spawned[3]);
        });
        const world = createWorld({ [workers]: 0 });
        await world.run(edit);
        expect(await Promise.all(spawned.map(async entity => [await read(world, entity, score), await read(world, entity, name)]))).toEqual([[10, "0"], [1, null], [2, "again"], [null, null]]);
        expect(await count(world, { required: [score] })).toBe(3);
        await world.dispose();
    });

    it("keep the spawns before a value that can't be written, and release that one's entity", async () => {
        const spawned: Entity[] = [];
        let poison = true;
        const spawn = System.create({ name: "batchesTest/spawn/2" }, ({ commands }) => {
            for (let i = 0; i < 3; i++) spawned.push(commands.spawn([position, score])({ [position]: [i, 0, 0], [score]: i }));
            // A symbol can't convert to a number, so writing it throws.
            if (poison) commands.spawn([position, score])({ [position]: [0, 0, 0], [score]: Symbol("x") as unknown as number });
        });
        const world = createWorld({ [workers]: 0 });
        expect((await world.run(spawn)).failures).toHaveLength(1);
        expect(await readEach(world, spawned, score)).toEqual([0, 1, 2]);
        poison = false;
        await world.run(spawn);
        expect(await count(world, { required: [score] })).toBe(6);
        expect(await readEach(world, spawned, score)).toEqual([0, 1, 2, 0, 1, 2]);
        await world.dispose();
    });

    it("take value objects built before the spawn", async () => {
        const spawned: Entity[] = [];
        const spawn = System.create({ name: "batchesTest/spawn/4" }, ({ commands }) => {
            for (let i = 0; i < 20; i++) {
                const values = i % 2 === 0 ? { [position]: [i, 0, 1] as const, [score]: i, [name]: `${i}` } : { [score]: i, [position]: [i, 0, 1] as const, [name]: `${i}` };
                spawned.push(commands.spawn([position, score, name])(values));
            }
        });
        const world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        expect(await Promise.all(spawned.map(entity => readEntity(world, entity, [position, score, name])))).toEqual(
            spawned.map((_, i) => ({ [position]: [i, 0, 1], [score]: i, [name]: `${i}` })));
        await world.dispose();
    });
});

describe("spawns keyed by symbols", () => {
    it("are staged into a batch, not queued as commands", () => {
        const state = createState();
        const buffer = createBuffer();
        const commands = createCommands(state, { buffer });
        commands.spawn([score, tag])({ [score]: 1 });
        expect(buffer.count).toBe(0);
        expect(state.batches.map(batch => batch.count)).toEqual([1]);
    });
    it("read only their components' values, as adds do", async () => {
        let spawned = Entity.none;
        const edit = System.create({ name: "batchesTest/stringKeys" }, ({ commands }) => {
            const values = { [score]: 1, "batchesTest/score": 2, [name]: "a" };
            spawned = commands.spawn([score])(values);
            commands.add(spawned, [score], values);
        });
        await using world = createWorld({ [workers]: 0 });
        await world.run(edit);
        expect(await toPromise(world.observe.entity(spawned))).toEqual({ [score]: 1 });
    });
});
