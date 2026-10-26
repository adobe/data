// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Index } from "../../interface/indexes/index-type.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { workers } from "../../interface/resources/workers.js";
import type { F32 } from "../../interface/math/index.js";
import { gpu } from "./gpu.test-helper.js";

const heat = Symbol("observerGpuTest/heat");
const rate = Symbol("observerGpuTest/rate");

declare module "@adobe/ecs" {
    export interface Components {
        [heat]: { type: F32 };
        [rate]: { type: F32 };
    }
}


const spawn = System.create({}, ({ commands }) => {
    for (let i = 0; i < 100; i++) commands.spawn([heat, rate])({ [heat]: i, [rate]: 1 });
});
const warm = System.create({ kernel: "gpu", components: { with: [rate, heat] } }, row => {
    row[heat] = row[heat] + row[rate] * 100;
});

let total = 0;
const sum = System.create({ observer: true, components: { with: [heat] } }, row => { total += row[heat]; });

const byHeat = Index.create({ key: [heat], sorted: true });
let hot = 0;
const countHot = System.create({ observer: true, lookup: { hot: { index: byHeat } } }, ({ lookup }) => {
    hot = lookup.hot({ ">=": 150 }).length;
});

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

describe("observer systems over GPU kernels' writes", () => {
    it.runIf(gpu)("read what a GPU kernel wrote in the run, read back for them", async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: await device() });
        await world.run(spawn);
        world.add(sum);
        total = 0;
        await world.run(warm);
        expect(total).toBe(4950 + 100 * 100);
        total = 0;
        await world.run(sum);
        expect(total).toBe(4950 + 100 * 100);
        await world.dispose();
    });

    it.runIf(gpu)("look up through indexes kept by what a GPU kernel wrote in the run, read back before they're refreshed", async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: await device() });
        await world.run(spawn);
        world.add(countHot);
        await world.run(warm);
        expect(hot).toBe(50);
        await world.run(warm);
        expect(hot).toBe(100);
        await world.dispose();
    });

    it.runIf(gpu)("look up on a joined thread through indexes kept by what a GPU kernel wrote in the run, read back before they're refreshed", async () => {
        const fixture = await import("./observer-joined.fixture.js");
        expect(await fixture.gpuLookups(await device())).toEqual([50, 100]);
    });
});
