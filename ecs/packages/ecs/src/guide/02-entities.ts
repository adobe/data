// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, Vec3, World } from "../index.js";

export const position = Symbol();
export const velocity = Symbol();
export const enemy = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        // A tag: present or not.
        [enemy]: { type: true };
    }
}

export const Particle = [position, velocity] as const;

export const spawn = System.create(({ commands }) => {
    commands.spawn([position, enemy])({ [position]: [0, 10, 0] });
    commands.spawn(Particle)({ [position]: [0, 0, 0], [velocity]: [1, 0, 0] });
});

export const defeat = System.create({ components: { with: [enemy] } }, (row, { commands }) => {
    commands.remove(row.entity, enemy);
});

const readFoes = System.create({ observer: true, components: { with: [position, enemy] } }, row => {
    console.log("a foe at", row[position]);
});
const readParticles = System.create({ observer: true, components: { with: [...Particle] } }, row => {
    console.log("a particle moving at", row[velocity]);
});

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(readFoes);
    await world.run(readParticles);
    await world.run(defeat);
    // No foe is left: logs nothing.
    await world.run(readFoes);
};
