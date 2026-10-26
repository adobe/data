// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type F32, System, type U32, Vec3, type World } from '@adobe/ecs';

export const position = Symbol();
export const velocity = Symbol();
export const delta = Symbol();
export const count = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
    }
    interface Resources {
        [delta]: { type: F32; default: 0 };
        [count]: { type: U32; default: 100 };
    }
}

// Main thread: resource-only, runs when `count` changes, including the first run.
export const spawn = System.create({
    resources: { changed: [count] },
}, ({ resources, commands }) => {
    for (let i = 0; i < resources[count]; i++) {
        commands.spawn([position, velocity])({ [position]: [0, 0, 0], [velocity]: [1, i, 0] });
    }
});

// Kernels: linear components and read-only resources, so the build compiles them to run in chunks across workers.
export const gravity = System.create({
    components: { with: [velocity] },
}, (row, { resources }) => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x, y - 9.8 * resources[delta], z];
});

export const integrate = System.create({
    components: { with: [velocity, position] },
    after: [gravity],
}, (row, { resources }) => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    const t = resources[delta];
    row[position] = [px + vx * t, py + vy * t, pz + vz * t];
});

// Transaction carrying frame time into the ECS.
export const setDelta = System.create({}, ({ resources }, input: { readonly seconds: number }) => {
    resources[delta] = input.seconds;
});

export const main = System.create({ systems: [spawn, gravity, integrate] });

// Reads every position the frame left, in spawn order.
const positions: Vec3[] = [];
const read = System.create({
    observer: true,
    components: { with: [position] },
}, row => {
    positions.push(row[position]);
});

export const frame = async (world: World, seconds: number): Promise<readonly Vec3[]> => {
    await world.run(setDelta, { seconds });
    await world.run(main);
    positions.length = 0;
    await world.run(read);
    return [...positions];
};
