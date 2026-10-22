// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Component, Entity, System, workers } from "../../index.js";
import { createWorld } from "./create.js";

const amount = Symbol("targetTest/amount");
const tagged = Symbol("targetTest/tagged");
declare module "@adobe/ecs" {
    interface Components {
        [amount]: { type: number };
        [tagged]: { type: true };
    }
}
Component.register(amount, { type: { type: "number" } });
Component.register(tagged, { type: { const: true } });

const one = { type: "object", properties: { entity: Entity.schema } } as const;

let spawned: Entity[] = [];
const spawn = System.create({ name: "targetTest/spawn" }, ({ commands }) => {
    spawned = [commands.spawn([amount, tagged])({ [amount]: 1 }), commands.spawn([amount, tagged])({ [amount]: 2 }), commands.spawn([amount])({ [amount]: 3 })];
});
const bump = System.create({ name: "targetTest/bump", input: one, target: "entity", components: { write: [amount], has: [tagged] } }, row => {
    row[amount] += 10;
});
const remove = System.create({ name: "targetTest/remove", input: one, target: "entity", components: { has: [tagged] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});
let amounts: number[] = [];
let changed: number[] = [];
const readAmounts = System.create({ name: "targetTest/readAmounts", observer: true, components: { read: [amount] } }, row => { amounts.push(row[amount]); });
const watchChanged = System.create({ name: "targetTest/watchChanged", observer: true, components: { read: [amount], changed: [amount] } }, row => { changed.push(row[amount]); });

const inline = () => createWorld({ [workers]: 0 });
const amountsOf = async (world: ReturnType<typeof inline>): Promise<number[]> => {
    amounts = [];
    await world.run(readAmounts);
    return [...amounts].sort((a, b) => a - b);
};

describe("systems on one entity", () => {
    it("run on the row of the entity their input names, writing only it", async () => {
        await using world = inline();
        await world.run(spawn);
        world.add(watchChanged);
        // Its first pass sees every row as changed.
        await world.run(watchChanged);
        changed = [];
        await world.run(bump, { entity: spawned[0] });
        expect(await amountsOf(world)).toEqual([2, 3, 11]);
        // Its write marks that row alone changed.
        expect(changed).toEqual([11]);
    });

    it("run on nothing for an entity that's gone or doesn't match, and issue commands for the one that does", async () => {
        await using world = inline();
        await world.run(spawn);
        await world.run(bump, { entity: spawned[2] });
        await world.run(bump, { entity: Entity.none });
        expect(await amountsOf(world)).toEqual([1, 2, 3]);
        await world.run(remove, { entity: spawned[1] });
        expect(await amountsOf(world)).toEqual([1, 3]);
        await world.run(bump, { entity: spawned[1] });
        expect(await amountsOf(world)).toEqual([1, 3]);
    });

    it("take their entity from an entity field of their input, and have components, no kernel, up, order or reduce", () => {
        // @ts-expect-error its target isn't an entity field
        expect(() => System.create({ name: "targetTest/notEntity", input: { type: "object", properties: { count: { type: "number" } } }, target: "count", components: { has: [amount] } }, () => {}))
            .toThrow('System "targetTest/notEntity" runs on one entity, so it takes it from an input field "count" holding an entity.');
        // @ts-expect-error it needs components
        expect(() => System.create({ name: "targetTest/noComponents", input: one, target: "entity" }, () => {})).toThrow('System "targetTest/noComponents" runs on one entity, so it needs components.');
    });
});
