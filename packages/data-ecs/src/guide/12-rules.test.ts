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
const meshes = Rule.create({ name: "guide/rules/meshes", query: { has: [mesh], not: [hidden] }, derives: [drawn] });
// Several rules may derive one component: it's present while any matches.
const sprites = Rule.create({ name: "guide/rules/sprites", query: { has: [sprite], not: [hidden] }, derives: [drawn] });
// Rules can build on what others derive.
const layers = Rule.create({ name: "guide/rules/layers", query: { has: [drawn] }, derives: [layer] });

const spawn = System.create({ name: "guide/rules/spawn" }, (_, __, commands) => {
    commands.spawn({ [mesh]: 1 });
    commands.spawn({ [sprite]: 2 });
    commands.spawn({ [mesh]: 3, [hidden]: true });
});
const hide = System.create({ name: "guide/rules/hide", query: { has: [sprite] } }, (row, _, commands) => {
    commands.add(row.entity, { [hidden]: true });
});

it("derives components from the components an entity has", async () => {
    await using world = await World.create({ systems: [spawn, hide, meshes, sprites, layers] });
    await world.run(spawn);
    expect(world.query.count([drawn])).toBe(2);
    expect(world.query.select([layer]).map(entity => world.read.component(entity, layer))).toEqual([1, 1]);
    await world.run(hide);
    expect(world.query.count([drawn])).toBe(1);
    expect(world.query.count([layer])).toBe(1);
});
