import { expect, it } from "vitest";
import { Component, Resource, System, Vec3, World } from "../index.js";

// A component or resource is an exported key; its type comes from augmenting `Types`, its schema from `register`.
// An application augments "@adobe/data-ecs/components" and "@adobe/data-ecs/resources".
export const position = "guide/components/position";
export const enemy = "guide/components/enemy";
export const gravity = "guide/components/gravity";

declare module "../component/types.js" {
    interface Types {
        [position]: { type: Vec3 };
        [enemy]: { type: true };
    }
}
declare module "../resource/types.js" {
    interface Types {
        [gravity]: { type: number };
    }
}
declare module "../system/types.js" {
    interface Types {
        "guide/components/spawn": true;
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(enemy, { type: { const: true } });
Resource.register(gravity, { type: { type: "number", default: -9.8 } });

export const spawn = System.create({ name: "guide/components/spawn" }, (_, __, commands) => {
    commands.spawn({ [position]: [0, 10, 0], [enemy]: true });
    commands.spawn({ [position]: [5, 0, 0] });
});

it("stores components on entities and resources once per world", async () => {
    await using world = await World.create({ systems: [spawn] });
    await world.run(spawn);
    const [first] = world.query.select([position, enemy]);
    expect(world.read.component(first, position)).toEqual([0, 10, 0]);
    expect(world.query.count([position])).toBe(2);
    expect(world.read.resource(gravity)).toBe(-9.8);
});
