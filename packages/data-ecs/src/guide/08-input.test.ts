import { expect, it } from "vitest";
import { Component, System } from "../index.js";
import { createWorld } from "../implementation/index.js";

const health = Symbol("health");

declare module "@adobe/data-ecs" {
    interface Components {
        [health]: { type: number };
    }
}

Component.register(health, { type: { type: "number" } });

const spawn = System.create(({ commands }) => { commands.spawn([health])({ [health]: 10 }); });

// input is an object schema of named fields; each run passes a value of it.
const hit = System.create({
    components: { write: [health] },
    input: { type: "object", properties: { amount: { type: "number" } } },
}, (row, { input }) => {
    row[health] -= input.amount;
});

const healths: number[] = [];
const read = System.create({ observer: true, components: { read: [health] } }, row => {
    healths.push(row[health]);
});

it("runs a system with a value", async () => {
    await using world = createWorld();
    await world.run(spawn);
    // Systems with input are run, not added; a composite's input has every field its members declare.
    await world.run(hit, { amount: 3 });
    await world.run(read);
    expect(healths).toEqual([7]);
});
