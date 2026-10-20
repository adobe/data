import { expect, it } from "vitest";
import { Component, Rule, System } from "../index.js";
import { createWorld } from "../implementation/index.js";

const mesh = Symbol("mesh");
const sprite = Symbol("sprite");
const hidden = Symbol("hidden");
const drawn = Symbol("drawn");
const layer = Symbol("layer");

declare module "@adobe/data-ecs" {
    interface Components {
        [mesh]: { type: number };
        [sprite]: { type: number };
        [hidden]: { type: true };
        // Only rules add derived components, starting at their schema's default.
        [drawn]: { type: true; derived: true };
        [layer]: { type: number; derived: true };
    }
}

Component.register(mesh, { type: { type: "number" } });
Component.register(sprite, { type: { type: "number" } });
Component.register(hidden, { type: { const: true } });
Component.register(drawn, { type: { const: true }, derived: true });
Component.register(layer, { type: { type: "number", default: 1 }, derived: true });

// Entities matching a rule have what it derives, only while they match.
Rule.create({ components: { has: [mesh], not: [hidden] }, derive: [drawn] });
// Several rules may derive one component, present while any matches.
Rule.create({ components: { has: [sprite], not: [hidden] }, derive: [drawn] });
// Rules build on what others derive.
Rule.create({ components: { has: [drawn] }, derive: [layer] });

const spawn = System.create(({ commands }) => {
    commands.spawn([mesh])({ [mesh]: 1 });
    commands.spawn([sprite])({ [sprite]: 2 });
    commands.spawn([mesh, hidden])({ [mesh]: 3 });
});
const hide = System.create({ components: { has: [sprite] } }, (row, { commands }) => {
    commands.add(row.entity, hidden);
});

const layers: number[] = [];
const read = System.create({ synced: true, components: { read: [layer], has: [drawn] } }, row => {
    layers.push(row[layer]);
});

it("derives components from the components an entity has", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(read);
    expect(layers).toEqual([1, 1]);
    await world.run(hide);
    layers.length = 0;
    await world.run(read);
    expect(layers).toEqual([1]);
});
