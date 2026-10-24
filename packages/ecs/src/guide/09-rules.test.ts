// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Rule, System, World } from "../index.js";

const mesh = Symbol();
const sprite = Symbol();
const hidden = Symbol();
const drawn = Symbol();
const layer = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [mesh]: { type: number };
        [sprite]: { type: number };
        [hidden]: { type: true };
        // Only rules add derived components, starting at their default.
        [drawn]: { type: true; derived: true };
        [layer]: { type: number; derived: true; default: 1 };
    }
}

// Entities matching a rule have what it derives, only while they match.
Rule.create({ components: { with: [mesh], not: [hidden] }, derive: [drawn] });
// Several rules may derive one component, present while any matches.
Rule.create({ components: { with: [sprite], not: [hidden] }, derive: [drawn] });
// Rules build on what others derive.
Rule.create({ components: { with: [drawn] }, derive: [layer] });

const spawn = System.create(({ commands }) => {
    commands.spawn([mesh])({ [mesh]: 1 });
    commands.spawn([sprite])({ [sprite]: 2 });
    commands.spawn([mesh, hidden])({ [mesh]: 3 });
});
const hide = System.create({ components: { with: [sprite] } }, (row, { commands }) => {
    commands.add(row.entity, hidden);
});

const layers: number[] = [];
const read = System.create({ observer: true, components: { with: [layer, drawn] } }, row => {
    layers.push(row[layer]);
});

it("derives components from the components an entity has", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(read);
    expect(layers).toEqual([1, 1]);
    await world.run(hide);
    layers.length = 0;
    await world.run(read);
    expect(layers).toEqual([1]);
});
