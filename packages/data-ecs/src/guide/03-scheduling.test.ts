import { expect, it } from "vitest";
import { Component, System, World } from "../index.js";
import { toPromise } from "../interface/observe/to-promise.js";
import { createWorld } from "../implementation/index.js";

const health = Symbol("guide/scheduling/health");
const damage = Symbol("guide/scheduling/damage");

declare module "@adobe/data-ecs" {
    interface Components {
        [health]: { type: number };
        [damage]: { type: number };
    }
}

Component.register(health, { type: { type: "number" } });
Component.register(damage, { type: { type: "number" } });

const spawn = System.create({ name: "guide/scheduling/spawn" }, ({ commands }) => { commands.spawn({ [health]: 10, [damage]: 4 }); });
const hit = System.create({ name: "guide/scheduling/hit", components: { read: [damage], write: [health] } }, row => {
    row[health] -= row[damage];
});
const heal = System.create({ name: "guide/scheduling/heal", components: { write: [health] }, after: [hit] }, row => {
    row[health] = Math.min(row[health] * 2, 10);
});
const frame = System.composite({ name: "guide/scheduling/frame", systems: [heal, hit] });

it("orders a composite's members by their constraints", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(frame);
    const [entity] = await toPromise(world.observe.select({ required: [health] }));
    // hit first, 10 - 4 = 6, then heal, min(12, 10); the other way round would end at 6.
    expect((await toPromise(world.observe.entity(entity, { required: [health] })))?.[health]).toBe(10);
});

it("rejects two systems that write the same component without an order between them", () => {
    const regenerate = System.create({ name: "guide/scheduling/regenerate", components: { write: [health] } }, row => { row[health] += 1; });
    expect(() => System.composite({ name: "guide/scheduling/unordered", systems: [regenerate, hit] })).toThrow('"guide/scheduling/regenerate" and "guide/scheduling/hit"');
});

// Phases are systems that do nothing. A system during one runs after what the phase follows and before what follows it.
const update = System.create({ name: "guide/scheduling/update" }, () => {});
const render = System.create({ name: "guide/scheduling/render", after: [update] }, () => {});
const poison = System.create({ name: "guide/scheduling/poison", components: { write: [health] }, during: [update] }, row => {
    row[health] -= 1;
});
const seen: number[] = [];
const report = System.create({ name: "guide/scheduling/report", components: { read: [health] }, during: [render] }, row => {
    seen.push(row[health]);
});
const phased = System.composite({ name: "guide/scheduling/phased", systems: [report, poison, update, render] });

it("orders systems during phases by the order of the phases", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(phased);
    // poison during update runs before render, so report during render sees 10 - 1.
    expect(seen).toEqual([9]);
});
