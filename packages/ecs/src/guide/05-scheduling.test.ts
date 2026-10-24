// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { System, World } from "../index.js";

const health = Symbol();
const damage = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [health]: { type: number };
        [damage]: { type: number };
    }
}

const spawn = System.create(({ commands }) => { commands.spawn([health, damage])({ [health]: 10, [damage]: 4 }); });
const hit = System.create({ components: { with: [damage, health] } }, row => {
    row[health] -= row[damage];
});
// before, after and during list the systems themselves.
const heal = System.create({ components: { with: [health] }, after: [hit] }, row => {
    row[health] = Math.min(row[health] * 2, 10);
});
// A list of systems is a composite: it runs its members as one system, in their order; members without an order
// between them may run in parallel. { systems, after, ... } declares one with constraints.
const frame = System.create([heal, hit]);

const healths: number[] = [];
const read = System.create({ observer: true, components: { with: [health] } }, row => {
    healths.push(row[health]);
});

it("orders a composite's members by their constraints", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(frame);
    await world.run(read);
    // hit, 10 - 4 = 6, then heal, min(12, 10).
    expect(healths).toEqual([10]);
});

// Phases are systems that do nothing; a system during one runs after what the phase follows and before what follows it.
const update = System.create(() => {});
const render = System.create({ after: [update] }, () => {});
const poison = System.create({ components: { with: [health] }, during: [update] }, row => {
    row[health] -= 1;
});
const seen: number[] = [];
const report = System.create({ components: { with: [health] }, during: [render] }, row => {
    seen.push(row[health]);
});
const phased = System.create([report, poison, update, render]);

it("orders systems during phases by the order of the phases", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(phased);
    expect(seen).toEqual([9]);
});
