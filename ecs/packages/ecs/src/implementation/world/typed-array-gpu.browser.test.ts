// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { F32 } from "../../interface/math/f32/index.js";
import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { Commands } from "../../interface/system/commands.js";
import { createWorld } from "./create.js";
import { gpu } from "./gpu.test-helper.js";
import { runReported } from "./outcomes.test-helper.js";
import { readEach, readResource, select } from "./reads.test-helper.js";

const cells = Symbol("typedArrayGpuTest/cells");
const levels = Symbol("typedArrayGpuTest/levels");
const clamped = Symbol("typedArrayGpuTest/clamped");
const words = Symbol("typedArrayGpuTest/words");
const cell = Symbol("typedArrayGpuTest/cell");
const level = Symbol("typedArrayGpuTest/level");

declare module "@adobe/ecs" {
    interface Resources {
        [cells]: { type: Uint8Array; length: 16 };
        [levels]: { type: Int16Array; length: 8 };
        [clamped]: { type: Uint8ClampedArray; length: 5 };
        [words]: { type: Uint32Array; length: 4 };
    }
    interface Components {
        [cell]: { type: F32 };
        [level]: { type: F32 };
    }
}

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

/** A world on the GPU, or on the CPU alone, and a way to run commands in it. */
const withCommands = async (onGpu: boolean) => {
    const world = createWorld({ [workers]: 0, ...onGpu ? { [gpuDevice]: await device() } : {} });
    let body: (commands: Commands) => void = () => {};
    const issue = System.create({}, ({ commands }) => body(commands));
    const run = async (next: (commands: Commands) => void): Promise<void> => {
        body = next;
        const [failure] = (await runReported(world, issue)).failures;
        if (failure !== undefined) throw new Error(failure.message);
    };
    return { world, run };
};

/** Writes each row's level at its cell, beyond the ends doing nothing. */
const paint = System.create({ kernel: "gpu", components: { with: [cell, level] } }, (row, { resources }) => { resources[levels][row[cell]] = row[level]; });
/** Copies each cell's level, NaN past the end, into the row. */
const sample = System.create({ kernel: "gpu", components: { with: [cell, level] } }, (row, { resources }) => { row[level] = resources[levels][row[cell]] + 0.5; });
/** Each of sixteen rows writes its own byte, next to the others' in the words they share. */
const mark = System.create({ kernel: "gpu", components: { with: [cell] } }, (row, { resources }) => { resources[cells][row[cell]] = row[cell] + 100; });
const clamp = System.create({ kernel: "gpu", components: { with: [cell, level] } }, (row, { resources }) => { resources[clamped][row[cell]] = row[level]; });

/** Sets the row's word to every bit. */
const fill = System.create({ kernel: "gpu", components: { with: [cell] } }, (row, { resources }) => { resources[words][row[cell]] = 0xFFFFFFFF; });
/** Copies the row's word to the next, through a local, and its low bit flipped to the one after. */
const copy = System.create({ kernel: "gpu", components: { with: [cell] } }, (row, { resources }) => {
    const value = resources[words][row[cell]];
    resources[words][row[cell] + 1] = value;
    resources[words][row[cell] + 2] = resources[words][row[cell]] ^ 1;
});

/** The words the kernels leave, run where `onGpu` says, and how many GPU records the world holds. */
const copied = async (onGpu: boolean) => {
    const { world, run } = await withCommands(onGpu);
    await run(commands => commands.spawn([cell])({ [cell]: 0 }));
    await world.run(fill);
    await world.run(copy);
    const result = { words: [...await readResource(world, words)], records: (await world.tables()).gpu };
    await world.dispose();
    return result;
};

/** What the kernels leave in the arrays and rows, run where `onGpu` says, and how many GPU records the world holds. */
const outcome = async (onGpu: boolean) => {
    const { world, run } = await withCommands(onGpu);
    await run(commands => {
        const spawn = commands.spawn([cell, level]);
        // Cells 9 and -1 are past the ends of the levels; 1.5 is no index.
        for (const [at, value] of [[0, 7], [2, -3], [7, 12], [9, 5], [-1, 6], [1.5, 8], [3, 40000]]) spawn({ [cell]: at, [level]: value });
    });
    await world.run(paint);
    const painted = [...await readResource(world, levels)];
    await world.run(sample);
    const entities = await select(world, { required: [cell, level] });
    const sampled = await readEach(world, entities, level);
    const { run: runMarks, world: marked } = await withCommands(onGpu);
    await runMarks(commands => { for (let i = 0; i < 16; i++) commands.spawn([cell])({ [cell]: i }); });
    await marked.run(mark);
    const bytes = [...await readResource(marked, cells)];
    const { run: runClamps, world: clamping } = await withCommands(onGpu);
    await runClamps(commands => {
        const spawn = commands.spawn([cell, level]);
        for (const [at, value] of [[0, 300], [1, 2.5], [2, 3.5], [3, 100.25], [4, -4]]) spawn({ [cell]: at, [level]: value });
    });
    await clamping.run(clamp);
    const clamps = [...await readResource(clamping, clamped)];
    const records = (await world.tables()).gpu + (await marked.tables()).gpu;
    await Promise.all([world.dispose(), marked.dispose(), clamping.dispose()]);
    return { painted, sampled, bytes, clamps, records };
};

describe("typed array resources on the GPU", () => {
    it.runIf(gpu)("are written and read by GPU kernels as by CPU ones, each byte its own, and read back for the CPU", async () => {
        const onGpu = await outcome(true);
        const onCpu = await outcome(false);
        expect(onGpu.records).toBeGreaterThan(0);
        expect({ ...onGpu, records: 0 }).toEqual({ ...onCpu, records: 0 });
        expect(onGpu.bytes).toEqual(Array.from({ length: 16 }, (_, i) => i + 100));
        expect(onGpu.painted).toEqual([7, 0, -3, new Int16Array([40000])[0], 0, 0, 0, 12]);
    });

    it.runIf(gpu)("keep every bit of a Uint32Array's elements that a kernel copies or combines as integers", async () => {
        const onGpu = await copied(true);
        const onCpu = await copied(false);
        expect(onGpu.records).toBeGreaterThan(0);
        expect(onCpu.words).toEqual([0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFE, 0]);
        expect(onGpu.words).toEqual(onCpu.words);
    });
});
