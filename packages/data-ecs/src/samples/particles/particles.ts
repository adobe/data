import { Component } from '../../interface/component/component.js';
import type { Entity } from '../../interface/entity/entity.js';
import { toPromise } from '../../interface/observe/to-promise.js';
import { Resource } from '../../interface/resource/resource.js';
import { Vec3 } from '../../interface/math/index.js';
import { System } from '../../interface/system/system.js';
import { World } from '../../interface/world/world.js';
import { createWorld } from '../../implementation/index.js';

export const position = 'particles/position';
export const velocity = 'particles/velocity';
export const delta = 'particles/delta';
export const count = 'particles/count';

declare module '@adobe/data-ecs' {
    export interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
    }
    export interface Resources {
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
        commands.spawn({ [position]: [0, 0, 0], [velocity]: [1, i, 0] });
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

export const main = System.composite({ name: "particles/main", systems: [spawn, gravity, integrate] });

export const frame = async (world: World, seconds: number): Promise<readonly Vec3[]> => {
    await world.run(setDelta, { seconds });
    await world.run(main);
    // Each read is an observer's first value.
    const particles = await toPromise(world.observe.select({ required: [position] }));
    return Promise.all(particles.map(async (entity: Entity) => (await toPromise(world.observe.entity(entity, { required: [position] })))?.[position] ?? [0, 0, 0]));
};

export const start = async (): Promise<World> => createWorld();
