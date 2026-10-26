// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type F32, System, Vec3, World } from "../index.js";

const position = Symbol();
const velocity = Symbol();
const delta = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
    }
    interface Resources {
        [delta]: { type: F32; default: 0.5 };
    }
}

// A kernel without asking: the build compiles it.
const move = System.create({ components: { with: [velocity, position] } }, (row, { resources }) => {
    row[position] = Vec3.add(row[position], Vec3.scale(row[velocity], resources[delta]));
});

const drift = System.create({ kernel: true, components: { with: [velocity, position] } }, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});

const slow = System.create({ kernel: false, components: { with: [velocity] } }, row => {
    row[velocity] = Vec3.scale(row[velocity], 0.5);
});

const moved: string[] = [];
const read = System.create({ observer: true, components: { with: [position, velocity] } }, row => {
    moved.push(`at ${row[position][0]}, moving at ${row[velocity][0]}`);
});

const spawn = System.create(({ commands }) => {
    for (let i = 0; i < 3; i++) commands.spawn([position, velocity])({ [position]: [i, 0, 0], [velocity]: [2, 0, 0] });
});

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(move);
    await world.run(drift);
    await world.run(slow);
    await world.run(read);
    console.log(moved.sort().join("; "));
};
