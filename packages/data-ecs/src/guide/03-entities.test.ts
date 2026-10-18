import { expect, it } from "vitest";
import { Component, Observe, System, Vec3 } from "../index.js";
import { createWorld } from "../implementation/index.js";

// A component is a key with a type and a schema, as a resource is; entities hold its values.
export const position = Symbol("position");
export const enemy = Symbol("enemy");

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
        // A tag: present or not, with no value.
        [enemy]: { type: true };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(enemy, { type: { const: true } });

// Systems spawn entities: name the components, then give their values.
export const spawn = System.create(({ commands }) => {
    commands.spawn([position, enemy])({ [position]: [0, 10, 0] });
    commands.spawn([position])({ [position]: [5, 0, 0] });
});

// Commands also add and remove components, and despawn entities.
export const defeat = System.create({ components: { has: [enemy] } }, (row, { commands }) => {
    commands.remove(row.entity, enemy);
});

it("spawns entities with components", async () => {
    await using world = createWorld();
    await world.run(spawn);
    const [foe] = await Observe.toPromise(world.observe.select({ required: [enemy] }));
    const values = await Observe.toPromise(world.observe.entity(foe, { required: [position] }));
    expect(values?.[position]).toEqual([0, 10, 0]);
    expect(await Observe.toPromise(world.observe.count({ required: [position] }))).toBe(2);
    await world.run(defeat);
    expect(await Observe.toPromise(world.observe.count({ required: [enemy] }))).toBe(0);
});
