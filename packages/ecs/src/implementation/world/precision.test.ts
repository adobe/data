// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import type { F32, Vec3 } from "../../interface/math/index.js";
import { kernelOf } from "./attach-kernel.js";
import { createWorld } from "./create.js";

const a = Symbol("precisionTest/a");
const c = Symbol("precisionTest/c");
const difference = Symbol("precisionTest/difference");
const position = Symbol("precisionTest/position");
const velocity = Symbol("precisionTest/velocity");

declare module "@adobe/ecs" {
    export interface Components {
        [a]: { type: F32 };
        [c]: { type: F32 };
        [difference]: { type: F32 };
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
    }
}

// a * a is 1 + 2⁻²² + 2⁻⁴⁶, which f32 rounds to c, so only arithmetic at f64 keeps the 2⁻⁴⁶.
const seed = System.create(({ commands }) => {
    for (let i = 0; i < 64; i++) commands.spawn([a, c, difference])({ [a]: 1 + 2 ** -23, [c]: 1 + 2 ** -22, [difference]: 0 });
});
const tried = System.create({ components: { with: [a, c, difference] } }, row => {
    row[difference] = row[a] * row[a] - row[c];
});
const written = System.create({ kernel: false, components: { with: [a, c, difference] } }, row => {
    row[difference] = row[a] * row[a] - row[c];
});
const seen: number[] = [];
const read = System.create({ kernel: false, components: { with: [difference] } }, row => {
    seen.push(row[difference]);
});

const differenceAfter = async (system: typeof tried, wasm: boolean): Promise<number | undefined> => {
    const world = createWorld({ [workers]: 0 }, { wasm });
    try {
        await world.run(seed);
        await world.run(system);
        seen.length = 0;
        await world.run(read);
        return seen[0];
    }
    finally {
        await world.dispose();
    }
};

it("computes an unflagged kernel at the precision the body as written does, in JS and WASM", async () => {
    expect(kernelOf(tried)).toBeDefined();
    const expected = await differenceAfter(written, true);
    expect(expected).toBe(Math.fround(2 ** -46));
    expect(await differenceAfter(tried, true)).toBe(expected);
    expect(await differenceAfter(tried, false)).toBe(expected);
});

/** Values where f32 arithmetic loses what f64 keeps: cancellation, rounding at each step, NaN, infinities and -0. */
const hard = (i: number): number => [1 + 2 ** -23, 1 + 2 ** -22, 3.4e38, -0, NaN, Infinity, 1e-45, 0.1, -7.25, 16777217][i % 10] * (1 + (i % 7) * 2 ** -20);
// Rows that leave a partial group of lanes at the end.
const rows = 1027;
const seedMany = System.create(({ commands }) => {
    for (let i = 0; i < rows; i++) commands.spawn([a, c, difference, position, velocity])({ [a]: hard(i), [c]: hard(i + 1), [difference]: 0, [position]: [hard(i + 2), hard(i + 3), hard(i + 4)], [velocity]: [hard(i + 5), hard(i + 6), hard(i)] });
});
const touch = System.create({ kernel: false, components: { with: [c] } }, row => {
    if (row.entity % 3 === 0) row[c] = row[c] * 3;
});
const pairs = [
    [
        System.create({ components: { with: [a, c, difference] } }, row => { row[difference] = Math.sqrt(Math.abs(row[a])) / row[c] + Math.min(row[a], 0.75) * Math.fround(row[c]) - Math.floor(row[a]); }),
        System.create({ kernel: false, components: { with: [a, c, difference] } }, row => { row[difference] = Math.sqrt(Math.abs(row[a])) / row[c] + Math.min(row[a], 0.75) * Math.fround(row[c]) - Math.floor(row[a]); }),
    ],
    [
        System.create({ components: { with: [velocity, position] } }, row => { row[position] = [row[position][0] * row[velocity][0] - row[velocity][0] * 0.75, row[position][1] * row[velocity][1] - row[velocity][1] * 0.75, row[position][2] * row[velocity][2] - row[velocity][2] * 0.75]; }),
        System.create({ kernel: false, components: { with: [velocity, position] } }, row => { row[position] = [row[position][0] * row[velocity][0] - row[velocity][0] * 0.75, row[position][1] * row[velocity][1] - row[velocity][1] * 0.75, row[position][2] * row[velocity][2] - row[velocity][2] * 0.75]; }),
    ],
    [
        System.create({ components: { with: [a, c, difference], changed: [c] } }, row => { row[difference] = row[a] * row[a] - row[c]; }),
        System.create({ kernel: false, components: { with: [a, c, difference], changed: [c] } }, row => { row[difference] = row[a] * row[a] - row[c]; }),
    ],
] as const;
const values: number[] = [];
const readAll = System.create({ kernel: false, components: { with: [difference, position] } }, row => {
    values.push(row[difference], ...row[position]);
});

/** Every value after a seed, a change to some rows and `system`, as bits, so NaN and -0 compare exactly. */
const bitsAfter = async (system: (typeof pairs)[number][number], wasm: boolean): Promise<readonly number[]> => {
    const world = createWorld({ [workers]: 0 }, { wasm });
    try {
        await world.run(seedMany);
        await world.run(system);
        await world.run(touch);
        await world.run(system);
        values.length = 0;
        await world.run(readAll);
        return [...new Uint32Array(new Float32Array(values).buffer)];
    }
    finally {
        await world.dispose();
    }
};

it("gives an unflagged kernel's results bit for bit as written, for dense columns, whole elements and change filters", async () => {
    for (const [index, [tried, written]] of pairs.entries()) {
        expect([index, kernelOf(tried) !== undefined]).toEqual([index, true]);
        const expected = await bitsAfter(written, true);
        expect([index, "wasm", await bitsAfter(tried, true)]).toEqual([index, "wasm", expected]);
        expect([index, "js", await bitsAfter(tried, false)]).toEqual([index, "js", expected]);
    }
});
