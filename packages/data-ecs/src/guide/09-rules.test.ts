import { expect, it } from "vitest";
import { Component, Observe, Rule, System } from "../index.js";
import { createWorld } from "../implementation/index.js";

const mesh = Symbol("mesh");
const sprite = Symbol("sprite");
const hidden = Symbol("hidden");
const drawn = Symbol("drawn");
const layer = Symbol("layer");

const meshTraits = Component.register(mesh, { type: { type: "number" } });
const spriteTraits = Component.register(sprite, { type: { type: "number" } });
const hiddenTraits = Component.register(hidden, { type: { const: true } });
// Only rules add derived components, starting at their default.
const drawnTraits = Component.register(drawn, { type: { const: true }, derived: true });
const layerTraits = Component.register(layer, { type: { type: "number", default: 1 }, derived: true });

declare module "@adobe/data-ecs" {
    interface Components {
        [mesh]: typeof meshTraits;
        [sprite]: typeof spriteTraits;
        [hidden]: typeof hiddenTraits;
        [drawn]: typeof drawnTraits;
        [layer]: typeof layerTraits;
    }
}

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

it("derives components from the components an entity has", async () => {
    await using world = createWorld();
    await world.run(spawn);
    expect(await Observe.toPromise(world.observe.count({ required: [drawn, layer] }))).toBe(2);
    await world.run(hide);
    expect(await Observe.toPromise(world.observe.count({ required: [drawn, layer] }))).toBe(1);
});
