import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import type { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { workers } from "../../interface/resources/workers.js";
import { adapters, settle, type Adapter } from "./observe-adapters.test-helper.js";

// The cases of `observers.browser.test.ts`, run for the world's own observers and the factories alike.

const heat = Symbol("observeCasesGpuTest/heat");
const rate = Symbol("observeCasesGpuTest/rate");

declare module "@adobe/data-ecs" {
    export interface Components {
        [heat]: { type: number };
        [rate]: { type: number };
    }
}

Component.register(heat, { type: { type: "number", precision: 1 } });
Component.register(rate, { type: { type: "number", precision: 1 } });

let spawned: Entity[] = [];
const spawn = System.create({ name: "observeCasesGpuTest/spawn" }, ({ commands }) => {
    spawned = [];
    for (let i = 0; i < 100; i++) spawned.push(commands.spawn([heat, rate])({ [heat]: i, [rate]: 1 }));
});
const warm = System.create({ name: "observeCasesGpuTest/warm", kernel: "gpu", components: { read: [rate], write: [heat] } }, row => {
    row[heat] = row[heat] + row[rate] * 100;
});

const idle = System.create({ name: "observeCasesGpuTest/idle" }, () => {});

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

const cases = ({ entity, select, count, toPromise }: Adapter): void => {
    it("give an entity's values the GPU wrote, read back after each run, and a first value once read back", async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: await device() });
        await world.run(spawn);
        const seen: unknown[] = [];
        const stop = entity(world, spawned[1], { required: [heat] })(value => seen.push(value));
        await settle(world);
        expect(seen).toEqual([{ [heat]: 1 }]);
        await world.run(warm);
        expect(seen).toEqual([{ [heat]: 1 }, { [heat]: 101 }]);
        stop();
        // Nothing observes heat during this run, so its writes stay on the GPU, and a first value waits for the readback.
        await world.run(warm);
        const later: unknown[] = [];
        entity(world, spawned[2], { required: [heat] })(value => later.push(value));
        expect(await toPromise(entity(world, spawned[3], { required: [heat] }))).toEqual({ [heat]: 203 });
        await settle(world);
        expect(later).toEqual([{ [heat]: 202 }]);
        await world.dispose();
    });

    it("give a query's result over values the GPU wrote", async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: await device() });
        await world.run(spawn);
        const counts: number[] = [];
        count(world, { required: [heat], where: { [heat]: { ">=": 100 } } })(value => counts.push(value));
        await settle(world);
        await world.run(warm);
        expect(counts).toEqual([0, 100]);
        await world.run(warm);
        const hot = await toPromise(select(world, { required: [heat], where: { [heat]: { ">=": 250 } } }));
        expect(new Set(hot)).toEqual(new Set(spawned.slice(50)));
        await world.dispose();
    });

    it("give an observer waiting for its first value nothing from a run queued before it", async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: await device() });
        await world.run(spawn);
        await world.run(warm);
        const running = world.run(warm);
        const seen: unknown[] = [];
        entity(world, spawned[0], { required: [heat] })(value => seen.push(value));
        const counts: number[] = [];
        count(world, { required: [heat], where: { [heat]: { ">=": 50 } } })(value => counts.push(value));
        await running;
        // Queued after the first values, so they've come by its end.
        await world.run(idle);
        await settle(world);
        expect(seen).toEqual([{ [heat]: 200 }]);
        expect(counts).toEqual([100]);
        await world.dispose();
    });
};

for (const adapter of adapters) describe(`${adapter.name} observers of GPU kernels' writes`, () => cases(adapter));
