import { expect, it } from "vitest";
import { Component, Rule, System, World } from "../index.js";

const mesh = "guide/rules/mesh";
const sprite = "guide/rules/sprite";
const hidden = "guide/rules/hidden";
const drawn = "guide/rules/drawn";
const layer = "guide/rules/layer";

declare module "@adobe/data-ecs" {
    interface Components {
        [mesh]: { type: number };
        [sprite]: { type: number };
        [hidden]: { type: true };
        [drawn]: { type: true; derived: true };
        [layer]: { type: number; derived: true };
    }
    interface Rules {
        "guide/rules/meshes": true;
        "guide/rules/sprites": true;
        "guide/rules/layers": true;
    }
    interface Systems {
        "guide/rules/spawn": true;
        "guide/rules/hide": true;
    }
}

Component.register(mesh, { type: { type: "number" } });
Component.register(sprite, { type: { type: "number" } });
Component.register(hidden, { type: { const: true } });
// A derived component starts at its schema's default whenever a rule adds it.
Component.register(drawn, { type: { const: true }, derived: true });
Component.register(layer, { type: { type: "number", default: 1 }, derived: true });

// Entities matching a rule's query have the components it derives, and only while they match.
Rule.create({ name: "guide/rules/meshes", components: { has: [mesh], not: [hidden] }, derive: [drawn] });
// Several rules may derive one component: it's present while any matches.
Rule.create({ name: "guide/rules/sprites", components: { has: [sprite], not: [hidden] }, derive: [drawn] });
// Rules can build on what others derive.
Rule.create({ name: "guide/rules/layers", components: { has: [drawn] }, derive: [layer] });

const spawn = System.create({ name: "guide/rules/spawn" }, ({ commands }) => {
    commands.spawn({ [mesh]: 1 });
    commands.spawn({ [sprite]: 2 });
    commands.spawn({ [mesh]: 3, [hidden]: true });
});
const hide = System.create({ name: "guide/rules/hide", components: { has: [sprite] } }, (row, { commands }) => {
    commands.add(row.entity, { [hidden]: true });
});

it("derives components from the components an entity has", async () => {
    await using world = World.create();
    await world.run(spawn);
    expect(world.query.count([drawn])).toBe(2);
    expect(world.query.select([layer]).map(entity => world.read.component(entity, layer))).toEqual([1, 1]);
    await world.run(hide);
    expect(world.query.count([drawn])).toBe(1);
    expect(world.query.count([layer])).toBe(1);
});
