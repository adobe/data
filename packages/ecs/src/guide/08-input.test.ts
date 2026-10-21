import { expect, it } from "vitest";
import { Component, Entity, System, World } from "../index.js";

const health = Symbol("health");

declare module "@adobe/ecs" {
    interface Components {
        [health]: { type: number };
    }
}

Component.register(health, { type: { type: "number" } });

let player = Entity.none;
const spawn = System.create(({ commands }) => { player = commands.spawn([health])({ [health]: 10 }); });

// input is an object schema of named fields; each run passes a value of it.
const hit = System.create({
    components: { write: [health] },
    input: { type: "object", properties: { amount: { type: "number" } } },
}, (row, { input }) => {
    row[health] -= input.amount;
});

// target names an input field holding an entity: the system runs on that entity's row alone, or on none once it's gone.
const heal = System.create({
    components: { write: [health] },
    input: { type: "object", properties: { entity: Entity.schema, amount: { type: "number" } } },
    target: "entity",
}, (row, { input }) => {
    row[health] += input.amount;
});

const healths: number[] = [];
const read = System.create({ observer: true, components: { read: [health] } }, row => {
    healths.push(row[health]);
});

it("runs a system with a value", async () => {
    await using world = World.create();
    await world.run(spawn);
    // Systems with input are run, not added; a composite's input has every field its members declare.
    await world.run(hit, { amount: 3 });
    await world.run(heal, { entity: player, amount: 1 });
    await world.run(read);
    expect(healths).toEqual([8]);
});
