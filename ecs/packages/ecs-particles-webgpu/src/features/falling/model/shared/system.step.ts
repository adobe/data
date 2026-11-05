// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from '@adobe/ecs';
import { count } from '../resource.count.js';
import { position } from './component.position.js';
import { velocity } from './component.velocity.js';
import { delta } from './resource.delta.js';

// Main thread: resource-only, runs when `count` changes, including the first run.
const spawn = System.create({
    resources: { changed: [count] },
}, ({ resources, commands }) => {
    for (let i = 0; i < resources[count]; i++) {
        commands.spawn([position, velocity])({ [position]: [0, 0, 0], [velocity]: [1, i, 0] });
    }
});

// Kernels: linear components and read-only resources, so the build compiles them to run in chunks across workers.
const gravity = System.create({
    components: { with: [velocity] },
}, (row, { resources }) => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x, y - 9.8 * resources[delta], z];
});

const integrate = System.create({
    components: { with: [velocity, position] },
    after: [gravity],
}, (row, { resources }) => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    const t = resources[delta];
    row[position] = [px + vx * t, py + vy * t, pz + vz * t];
});

/** A frame: spawns the bodies `count` asks for, then pulls each down and moves it by `delta`. */
export const step: System = System.create({ systems: [spawn, gravity, integrate] });
