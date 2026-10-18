import { expect, it } from "vitest";
import { Component, Observe, System } from "../index.js";
import { createWorld } from "../implementation/index.js";

const health = Symbol("health");
const damage = Symbol("damage");

declare module "@adobe/data-ecs" {
    interface Components {
        [health]: { type: number };
        [damage]: { type: number };
    }
}

Component.register(health, { type: { type: "number" } });
Component.register(damage, { type: { type: "number" } });

const spawn = System.create(({ commands }) => { commands.spawn([health, damage])({ [health]: 10, [damage]: 4 }); });
const hit = System.create({ components: { read: [damage], write: [health] } }, row => {
    row[health] -= row[damage];
});
// before, after and during list the systems themselves.
const heal = System.create({ components: { write: [health] }, after: [hit] }, row => {
    row[health] = Math.min(row[health] * 2, 10);
});
// A list of systems is a composite: it runs its members as one system, in their order; members without an order
// between them may run in parallel. { systems, after, ... } declares one with a name or constraints.
const frame = System.create([heal, hit]);

it("orders a composite's members by their constraints", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(frame);
    const [entity] = await Observe.toPromise(world.observe.select({ required: [health] }));
    // hit, 10 - 4 = 6, then heal, min(12, 10).
    expect((await Observe.toPromise(world.observe.entity(entity, { required: [health] })))?.[health]).toBe(10);
});

// Phases are systems that do nothing; a system during one runs after what the phase follows and before what follows it.
const update = System.create(() => {});
const render = System.create({ after: [update] }, () => {});
const poison = System.create({ components: { write: [health] }, during: [update] }, row => {
    row[health] -= 1;
});
const seen: number[] = [];
const report = System.create({ components: { read: [health] }, during: [render] }, row => {
    seen.push(row[health]);
});
const phased = System.create([report, poison, update, render]);

it("orders systems during phases by the order of the phases", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(phased);
    expect(seen).toEqual([9]);
});
