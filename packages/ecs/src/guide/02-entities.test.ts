// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { System, Vec3, World } from "../index.js";

// A component is a key whose values entities hold, declared as a resource is.
export const position = Symbol();
export const velocity = Symbol();
export const enemy = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        // A tag: present or not, with no value.
        [enemy]: { type: true };
    }
}

// An archetype is a list of components declared `as const` at module scope, which the build indexes; it goes wherever
// a list of components does.
export const Particle = [position, velocity] as const;

// Systems spawn entities: name the components, then give their values.
export const spawn = System.create(({ commands }) => {
    commands.spawn([position, enemy])({ [position]: [0, 10, 0] });
    commands.spawn(Particle)({ [position]: [0, 0, 0], [velocity]: [1, 0, 0] });
});

// Commands also add and remove components, and despawn entities.
export const defeat = System.create({ components: { with: [enemy] } }, (row, { commands }) => {
    commands.remove(row.entity, enemy);
});

// An observer system reads them back, once per entity with its components.
const foes: Vec3[] = [];
const readFoes = System.create({ observer: true, components: { with: [position, enemy] } }, row => {
    foes.push(row[position]);
});
let particles = 0;
const countParticles = System.create({ observer: true, components: { with: [...Particle] } }, () => {
    particles += 1;
});

it("spawns entities with components", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(readFoes);
    await world.run(countParticles);
    expect(foes).toEqual([[0, 10, 0]]);
    expect(particles).toBe(1);
    await world.run(defeat);
    foes.length = 0;
    await world.run(readFoes);
    expect(foes).toEqual([]);
});
