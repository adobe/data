// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { F32, I32, Vec2 } from "../../interface/math/index.js";
import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { kernelOf } from "./attach-kernel.js";
import { createWorld } from "./create.js";

const scale = Symbol("sharedGpuTest/scale");
const cell = Symbol("sharedGpuTest/cell");
const flag = Symbol("sharedGpuTest/flag");
const value = Symbol("sharedGpuTest/value");
const out = Symbol("sharedGpuTest/out");
const steps = Symbol("sharedGpuTest/steps");
const copied = Symbol("sharedGpuTest/copied");
const product = Symbol("sharedGpuTest/product");
const sum = Symbol("sharedGpuTest/sum");
const compound = Symbol("sharedGpuTest/compound");
declare module "@adobe/ecs" {
    export interface Components {
        [scale]: { type: F32; shared: true };
        [cell]: { type: Vec2.I32; shared: true };
        [flag]: { type: boolean; shared: true };
        [value]: { type: F32 };
        [out]: { type: F32 };
        [steps]: { type: I32 };
        [copied]: { type: F32 };
        [product]: { type: F32 };
        [sum]: { type: F32 };
        [compound]: { type: F32 };
    }
}

const spawn = System.create(({ commands }) => {
    for (let k = 0; k < 300; k++) {
        commands.spawn([scale, cell, flag, value, out, steps], { [scale]: [0.5, 2, -4][k % 3] ?? 0, [cell]: [k % 2, -20000001 - k % 5], [flag]: k % 4 === 0 })({ [value]: k, [out]: 0, [steps]: 0 });
    }
});
// Each dispatch's record holds its archetype's values: an integer's leaves as integers, past f32's exact range.
const compute = System.create({ kernel: "gpu", components: { with: [scale, cell, flag, value, out, steps] } }, row => {
    const [x, y] = row[cell];
    row[out] = row[value] * row[scale] + (row[flag] ? x : -x);
    row[steps] = y ^ x;
});

// Scales that aren't integers, nor exact in binary: what the GPU gives bit for bit, and what it doesn't.
const spawnFractions = System.create(({ commands }) => {
    for (let k = 0; k < 300; k++) {
        commands.spawn([scale, value, copied, product, sum, compound], { [scale]: [0.1, 1.7, -3.3][k % 3] ?? 0 })({ [value]: k * 0.37, [copied]: 0, [product]: 0, [sum]: 0, [compound]: 0 });
    }
});
const fractions = System.create({ kernel: "gpu", components: { with: [scale, value, copied, product, sum, compound] } }, row => {
    row[copied] = row[scale];
    row[product] = row[value] * row[scale];
    row[sum] = row[value] + row[scale];
    row[compound] = row[value] * row[scale] / 3 + row[scale] * row[scale];
});
const fractionsOf = async (world: ReturnType<typeof createWorld>): Promise<readonly (readonly number[])[]> => {
    const read: [number, number[]][] = [];
    await world.run(System.create({ observer: true, components: { with: [value, copied, product, sum, compound] } }, row => { read.push([row[value], [row[copied], row[product], row[sum], row[compound], row[value]]]); }));
    return read.sort((a, b) => a[0] - b[0]).map(([, values]) => values);
};

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

const results = async (world: ReturnType<typeof createWorld>): Promise<readonly string[]> => {
    const read: [number, string][] = [];
    await world.run(System.create({ observer: true, components: { with: [value, out, steps] } }, row => { read.push([row[value], `${row[out]} ${row[steps]}`]); }));
    return read.sort((a, b) => a[0] - b[0]).map(([, text]) => text);
};

describe("a GPU kernel reading a shared component", () => {
    it("reads its dispatch's archetype's value from its record, as the CPU does", async () => {
        expect(kernelOf(compute)?.shared).toEqual([scale, cell, flag]);
        await using cpu = createWorld({ [workers]: 0 });
        await cpu.run(spawn);
        await cpu.run(compute);
        await using gpu = createWorld({ [workers]: 0, [gpuDevice]: await device() });
        await gpu.run(spawn);
        await gpu.run(compute);
        const expected = await results(cpu);
        expect(await results(gpu)).toEqual(expected);
        expect(expected[1]).toBe("1 -20000001");
    });
    it("gives a shared f32 value, and one product or sum of f32s, bit for bit; longer arithmetic within a few roundings", async () => {
        await using cpu = createWorld({ [workers]: 0 });
        await cpu.run(spawnFractions);
        await cpu.run(fractions);
        await using gpu = createWorld({ [workers]: 0, [gpuDevice]: await device() });
        await gpu.run(spawnFractions);
        await gpu.run(fractions);
        const expected = await fractionsOf(cpu);
        const found = await fractionsOf(gpu);
        expect(found.map(([copy, times, plus]) => [copy, times, plus])).toEqual(expected.map(([copy, times, plus]) => [copy, times, plus]));
        // A quotient and a sum of products round each step in f32 on the GPU, as JS rounds once, at the store: within
        // a few f32 rounding errors of its largest term, however much the terms cancel.
        const errors = found.map((values, k) => {
            const [scaled, , , exact, at] = expected[k];
            return Math.abs(values[3] - exact) / Math.max(Math.abs(at * scaled / 3), scaled * scaled);
        });
        expect(Math.max(...errors)).toBeLessThanOrEqual(2 ** -21);
    });
});
