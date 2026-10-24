// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Entity, System, World } from "../index.js";

const health = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [health]: { type: number };
    }
}

let player = Entity.none;
const spawn = System.create(({ commands }) => { player = commands.spawn([health])({ [health]: 10 }); });

// A body's input is its parameter after its context, an object of named fields; each run passes a value of it.
const hit = System.create({
    components: { with: [health] },
}, (row, _context, input: { readonly amount: number }) => {
    row[health] -= input.amount;
});

// target names an input field holding an entity: the system runs on that entity's row alone, or on none once it's gone.
const heal = System.create({
    components: { with: [health] },
    target: "entity",
}, (row, _context, input: { readonly entity: Entity; readonly amount: number }) => {
    row[health] += input.amount;
});

const healths: number[] = [];
const read = System.create({ observer: true, components: { with: [health] } }, row => {
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
