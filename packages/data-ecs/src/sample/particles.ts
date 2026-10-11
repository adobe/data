import { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import { Resource } from '../resource/resource.js';
import type { Schema } from '../schema/schema.js';
import { System } from '../system/system.js';
import { World } from '../world/world.js';

export type Vec3 = readonly [number, number, number];
const vec3: Schema.ForType<Vec3> = { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 };

export const position = 'particles/position';
export const velocity = 'particles/velocity';
export const delta = 'particles/delta';
export const count = 'particles/count';

declare module '../component/types.js' {
    export interface Types {
        [position]: Vec3;
        [velocity]: Vec3;
    }
}
declare module '../resource/types.js' {
    export interface Types {
        [delta]: number;
        [count]: number;
    }
}
declare module '../system/types.js' {
    export interface Types {
        "particles/spawn": true;
        "particles/integrate": true;
        "particles/gravity": true;
        "particles/setDelta": true;
        "particles/main": true;
    }
}

Component.register(position, vec3);
Component.register(velocity, vec3);
Resource.register(delta, { type: "number", precision: 1, default: 0 });
Resource.register(count, { type: "integer", minimum: 0, default: 100 });

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
    kernel: true,
    query: { read: [velocity], write: [velocity] },
    resources: { read: [delta] },
}, (row, context) => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x, y - 9.8 * context[delta], z];
});

export const integrate = System.create({
    name: "particles/integrate",
    kernel: true,
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
