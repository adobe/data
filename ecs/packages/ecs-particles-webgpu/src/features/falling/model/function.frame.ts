// © 2026 Adobe. MIT License. See /LICENSE for details.
// component-check: unused-export-ok the falling simulation is a kernel sample that only its test drives; no app runs it.
import { type F32, System, type Vec3, type World } from '@adobe/ecs';
import { count } from './resource.count.js';

/** Runs a frame `seconds` long and returns every position it left, in spawn order. */
export const frame = async (world: World, seconds: number): Promise<readonly Vec3[]> => {
    await world.run(setDelta, { seconds });
    await world.run(step);
    positions.length = 0;
    await world.run(read);
    return [...positions];
};

const position = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [position]: { type: Vec3 };
    }
}

const velocity = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [velocity]: { type: Vec3 };
    }
}

/** The seconds a frame moves particles by. */
const delta = Symbol();

declare module '@adobe/ecs' {
    interface Resources {
        [delta]: { type: F32; default: 0 };
    }
}

/** Carries a frame's time into the world. */
const setDelta: System<{ readonly seconds: number }> = System.create({}, ({ resources }, input: { readonly seconds: number }) => {
    resources[delta] = input.seconds;
});

/** On the main thread, as it's resource-only: spawns the bodies `count` asks for whenever it changes, including the first run. */
const spawn: System = System.create({
    resources: { changed: [count] },
}, ({ resources, commands }) => {
    for (let i = 0; i < resources[count]; i++) {
        commands.spawn([position, velocity])({ [position]: [0, 0, 0], [velocity]: [1, i, 0] });
    }
});

/** A kernel, as it has linear components and read-only resources: pulls each body down for `delta`. */
const gravity: System = System.create({
    components: { with: [velocity] },
}, (row, { resources }) => {
    const [x, y, z] = row[velocity];
    row[velocity] = [x, y - 9.8 * resources[delta], z];
});

/** A kernel: moves each body by its velocity for `delta`, after gravity. */
const integrate: System = System.create({
    components: { with: [velocity, position] },
    after: [gravity],
}, (row, { resources }) => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    const t = resources[delta];
    row[position] = [px + vx * t, py + vy * t, pz + vz * t];
});

/** A frame's step: spawns the bodies `count` asks for, then pulls each down and moves it by `delta`. */
const step: System = System.create({ systems: [spawn, gravity, integrate] });

const positions: Vec3[] = [];
const read = System.create({
    readonly: true,
    components: { with: [position] },
}, row => {
    positions.push(row[position]);
});
