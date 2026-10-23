// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Entity, System, World } from "../index.js";

const ship = Symbol();
const parent = Symbol();
const target = Symbol();
const selected = Symbol();
const outline = Symbol();

// Traits are the fields of a key's declaration; type is one.
declare module "@adobe/ecs" {
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

const counts = { outlined: 0, targeting: 0, all: 0 };
const countOutlined = System.create({ observer: true, components: { has: [outline] } }, () => { counts.outlined += 1; });
const countTargeting = System.create({ observer: true, components: { has: [target] } }, () => { counts.targeting += 1; });
const countAll = System.create({ observer: true, components: {} }, () => { counts.all += 1; });

it("removes components with their host, and follows references", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(deselect);
    await world.run(countOutlined);
    expect(counts.outlined).toBe(0);
    await world.run(destroy);
    await world.run(countTargeting);
    await world.run(countAll);
    // The owned entity is gone; the weak holder lives on without target.
    expect(counts).toEqual({ outlined: 0, targeting: 0, all: 1 });
});
