// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32, I32, Vec2 } from "../../interface/math/index.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";

/** Kernels reading shared components on workers, each call its archetype's values, over archetypes of several values. */

const scale = Symbol("sharedWorkersTest/scale");
const cell = Symbol("sharedWorkersTest/cell");
const value = Symbol("sharedWorkersTest/value");
const out = Symbol("sharedWorkersTest/out");
const steps = Symbol("sharedWorkersTest/steps");
declare module "@adobe/ecs" {
    export interface Components {
        [scale]: { type: F32; shared: true };
        [cell]: { type: Vec2.I32; shared: true };
        [value]: { type: F32 };
        [out]: { type: F32 };
        [steps]: { type: I32 };
    }
}

const rows = 400;
const spawn = System.create(({ commands }) => {
    for (let k = 0; k < rows; k++) {
        commands.spawn([scale, cell, value, out, steps], { [scale]: [0.1, 1.5, -3.25][k % 3] ?? 0, [cell]: [k % 2, -7] })({ [value]: k * 0.7, [out]: 0, [steps]: 0 });
    }
});
// Tried as a kernel, and as written: the kernel's results are the body's.
const compute = System.create({ components: { with: [scale, cell, value, out, steps] } }, row => {
    const [x, y] = row[cell];
    row[out] = row[value] * row[scale] + x / 3;
    row[steps] = x * 1000 + y;
});
const written = System.create({ kernel: false, components: { with: [scale, cell, value, out, steps] } }, row => {
    const [x, y] = row[cell];
    row[out] = row[value] * row[scale] + x / 3;
    row[steps] = x * 1000 + y;
});
const read: [number, string][] = [];
const results = System.create({ readonly: true, components: { with: [value, out, steps] } }, row => { read.push([row[value], `${row[out]} ${row[steps]}`]); });

const outcome = async (system: typeof compute, wasm: boolean): Promise<readonly string[]> => {
    await using world = createWorld({ [workers]: 2 }, { minimumChunk: 2, wasm });
    await world.run(spawn);
    await world.run(system);
    read.length = 0;
    await world.run(results);
    return read.sort((a, b) => a[0] - b[0]).map(([, text]) => text);
};

/** Each row's results, by a kernel on workers and by the body as written. */
export const computedOnWorkers = async (wasm: boolean): Promise<{ readonly kernel: readonly string[]; readonly written: readonly string[] }> =>
    ({ kernel: await outcome(compute, wasm), written: await outcome(written, wasm) });

// With `where`, workers only ever run the archetypes that pass.
const negative = System.create({ components: { with: [value, out], where: { [scale]: value => value < 0 } } }, row => {
    row[out] = row[value] * 2;
});

/** How many rows a kernel with `where` wrote on workers, and how many it left. */
export const whereOnWorkers = async (wasm: boolean): Promise<{ readonly written: number; readonly left: number }> => {
    await using world = createWorld({ [workers]: 2 }, { minimumChunk: 2, wasm });
    await world.run(spawn);
    await world.run(negative);
    let written = 0;
    let left = 0;
    await world.run(System.create({ readonly: true, components: { with: [value, out] } }, row => {
        if (row[out] === 0 && row[value] !== 0) left++;
        else written++;
    }));
    return { written, left };
};
