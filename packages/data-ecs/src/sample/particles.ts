import { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import { Resource } from '../resource/resource.js';
import { Vec3 } from '../math/index.js';
import { System } from '../system/system.js';
import { World } from '../world/world.js';

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
    export interface Systems {
        "particles/spawn": true;
        "particles/integrate": true;
        "particles/gravity": true;
        "particles/setDelta": true;
        "particles/main": true;
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
}, (_, context, commands) => {
    for (let i = 0; i < context[count]; i++) {
        commands.spawn({ [position]: [0, 0, 0], [velocity]: [1, i, 0] });
    }
});

// Kernels: linear components and read-only resources, so they can run in chunks across workers.
export const gravity = System.create({
    name: "particles/gravity",
    kernel: "cpu",
    query: { read: [velocity], write: [velocity] },
    resources: { read: [delta] },
}, (row, context) => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x, y - 9.8 * context[delta], z];
});

export const integrate = System.create({
    name: "particles/integrate",
    kernel: "cpu",
    query: { read: [position, velocity], write: [position] },
    resources: { read: [delta] },
    after: ["particles/gravity"],
}, (row, context) => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    const t = context[delta];
    row[position] = [px + vx * t, py + vy * t, pz + vz * t];
});

// Transaction carrying frame time into the ECS.
export const setDelta = System.create({
    name: "particles/setDelta",
    args: { type: "number" },
    resources: { write: [delta] },
}, (_, context) => {
    context[delta] = context.args;
});

export const main = System.composite({ name: "particles/main", systems: [spawn, gravity, integrate] });

export const frame = async (world: World, seconds: number): Promise<readonly Vec3[]> => {
    await world.run(setDelta, seconds);
    await world.run(main);
    return world.query.select([position]).map((entity: Entity) => world.read.component(entity, position) ?? [0, 0, 0]);
};

export const start = async (): Promise<World> => World.create({ systems: [setDelta, main] });
