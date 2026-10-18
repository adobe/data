import { expect, it } from "vitest";
import { Archetype, Component, Observe, System, Vec3 } from "../index.js";
import { createWorld } from "../implementation/index.js";

export const position = Symbol("position");
export const velocity = Symbol("velocity");

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(velocity, { type: Vec3.schema });

// An archetype is a list of components, declared once at module scope; it goes wherever a list of components does.
export const Particle = Archetype.create([position, velocity]);

export const emit = System.create(({ commands }) => {
    commands.spawn(Particle)({ [position]: [0, 0, 0], [velocity]: [1, 0, 0] });
});

it("names a list of components", async () => {
    await using world = createWorld();
    await world.run(emit);
    expect(await Observe.toPromise(world.observe.count({ required: Particle }))).toBe(1);
});
