import { expect, it } from "vitest";
import { Component, Resource, System, Vec3, World } from "../index.js";
import { toPromise } from "../types/observe/to-promise.js";
import { createWorld } from "../implementation/index.js";

// A component or resource is an exported key: `Components` or `Resources` give its type, `register` its schema.
export const position = "guide/components/position";
export const enemy = "guide/components/enemy";
export const gravity = "guide/components/gravity";

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [enemy]: { type: true };
    }
    interface Resources {
        [gravity]: { type: number };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(enemy, { type: { const: true } });
Resource.register(gravity, { type: { type: "number", default: -9.8 } });

export const spawn = System.create({ name: "guide/components/spawn" }, ({ commands }) => {
    commands.spawn({ [position]: [0, 10, 0], [enemy]: true });
    commands.spawn({ [position]: [5, 0, 0] });
});

it("stores components on entities and resources once per world", async () => {
    await using world = createWorld();
    await world.run(spawn);
    const [first] = await toPromise(world.observe.select({ required: [position, enemy] }));
    const components = await toPromise(world.observe.entity(first, { required: [position] }));
    expect(components?.[position]).toEqual([0, 10, 0]);
    expect(await toPromise(world.observe.count({ required: [position] }))).toBe(2);
    expect(await toPromise(world.observe.resource(gravity))).toBe(-9.8);
});
