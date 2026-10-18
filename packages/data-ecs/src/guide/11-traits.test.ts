import { expect, it } from "vitest";
import { Component, Entity, Observe, System } from "../index.js";
import { createWorld } from "../implementation/index.js";

const ship = Symbol("ship");
const parent = Symbol("parent");
const target = Symbol("target");
const selected = Symbol("selected");
const outline = Symbol("outline");

// Traits are the fields of a key's declaration; type is one. Registration repeats them.
declare module "@adobe/data-ecs" {
    interface Components {
        [ship]: { type: true };
        // Despawned with the entity it points to.
        [parent]: { type: Entity; reference: "owner" };
        // Removed when the entity it points to despawns.
        [target]: { type: Entity; reference: "weak" };
        [selected]: { type: true };
        // Removed with selected.
        [outline]: { type: number; within: typeof selected };
    }
}

Component.register(ship, { type: { const: true } });
Component.register(parent, { type: Entity.schema, reference: "owner" });
Component.register(target, { type: Entity.schema, reference: "weak" });
Component.register(selected, { type: { const: true } });
Component.register(outline, { type: { type: "number" }, within: selected });

const spawn = System.create(({ commands }) => {
    const mothership = commands.spawn([ship, selected, outline])({ [outline]: 2 });
    commands.spawn([parent])({ [parent]: mothership });
    commands.spawn([target])({ [target]: mothership });
});
const deselect = System.create({ components: { has: [selected] } }, (row, { commands }) => {
    commands.remove(row.entity, selected);
});
const destroy = System.create({ components: { has: [ship] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});

it("removes components with their host, and follows references", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(deselect);
    expect(await Observe.toPromise(world.observe.count({ required: [outline] }))).toBe(0);
    await world.run(destroy);
    expect(await Observe.toPromise(world.observe.count({ required: [parent] }))).toBe(0);
    expect(await Observe.toPromise(world.observe.count({ required: [target] }))).toBe(0);
    // The weak holder lives on without target.
    expect(await Observe.toPromise(world.observe.count({}))).toBe(1);
});
