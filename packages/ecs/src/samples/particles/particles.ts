import { Component, Resource, System, Vec3, type World } from '../../index.js';

export const position = Symbol("particles/position");
export const velocity = Symbol("particles/velocity");
export const delta = Symbol("particles/delta");
export const count = Symbol("particles/count");

declare module '@adobe/ecs' {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
    }
    interface Resources {
        [delta]: { type: number };
        [count]: { type: number };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(velocity, { type: Vec3.schema });
Resource.register(delta, { type: { type: "number", precision: 1, default: 0 } });
Resource.register(count, { type: { type: "integer", minimum: 0, default: 100 } });

// Main thread: resource-only, runs when `count` changes, including the first run.
export const spawn = System.create({
    name: "particles/spawn",
    resources: { read: [count], changed: [count] },
}, ({ resources, commands }) => {
    for (let i = 0; i < resources[count]; i++) {
        commands.spawn([position, velocity])({ [position]: [0, 0, 0], [velocity]: [1, i, 0] });
    }
});

// Kernels: linear components and read-only resources, so they can run in chunks across workers.
export const gravity = System.create({
    name: "particles/gravity",
    kernel: "cpu",
    components: { write: [velocity] },
    resources: { read: [delta] },
}, (row, { resources }) => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x, y - 9.8 * resources[delta], z];
});

export const integrate = System.create({
    name: "particles/integrate",
    kernel: "cpu",
    components: { read: [velocity], write: [position] },
    resources: { read: [delta] },
    after: [gravity],
}, (row, { resources }) => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    const t = resources[delta];
    row[position] = [px + vx * t, py + vy * t, pz + vz * t];
});

// Transaction carrying frame time into the ECS.
export const setDelta = System.create({
    name: "particles/setDelta",
    input: { type: "object", properties: { seconds: { type: "number" } } },
    resources: { write: [delta] },
}, ({ resources, input }) => {
    resources[delta] = input.seconds;
});

export const main = System.create({ name: "particles/main", systems: [spawn, gravity, integrate] });

// Reads every position the frame left, in spawn order.
const positions: Vec3[] = [];
const read = System.create({
    name: "particles/read",
    observer: true,
    components: { read: [position] },
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
