import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import type { Entity } from "../../entity/entity.js";
import { toPromise } from "../../observe/to-promise.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

const heat = "observersGpuTest/heat";
const rate = "observersGpuTest/rate";

declare module "@adobe/data-ecs" {
    export interface Components {
        [heat]: { type: number };
        [rate]: { type: number };
    }
}

Component.register(heat, { type: { type: "number", precision: 1 } });
Component.register(rate, { type: { type: "number", precision: 1 } });

let spawned: Entity[] = [];
const spawn = System.create({ name: "observersGpuTest/spawn" }, ({ commands }) => {
    spawned = [];
    for (let i = 0; i < 100; i++) spawned.push(commands.spawn({ [heat]: i, [rate]: 1 }));
});
const warm = System.create({ name: "observersGpuTest/warm", kernel: "gpu", components: { read: [rate], write: [heat] } }, row => {
    row[heat] = row[heat] + row[rate] * 100;
});

const idle = System.create({ name: "observersGpuTest/idle" }, () => {});

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

describe("observers of GPU kernels' writes", () => {
    it("give an entity's values the GPU wrote, read back after each run, and a first value once read back", async () => {
        const world = createWorld({ workers: 0, resources: { gpuDevice: await device() } });
        await world.run(spawn);
        const seen: unknown[] = [];
        const stop = world.observe.entity(spawned[1], { required: [heat] })(value => seen.push(value));
        expect(seen).toEqual([{ [heat]: 1 }]);
        await world.run(warm);
        expect(seen).toEqual([{ [heat]: 1 }, { [heat]: 101 }]);
        stop();
        // Nothing observes heat during this run, so its writes stay on the GPU, and a first value waits for the readback.
        await world.run(warm);
        const later: unknown[] = [];
        world.observe.entity(spawned[2], { required: [heat] })(value => later.push(value));
        expect(later).toEqual([]);
        expect(await toPromise(world.observe.entity(spawned[3], { required: [heat] }))).toEqual({ [heat]: 203 });
        expect(later).toEqual([{ [heat]: 202 }]);
        await world.dispose();
    });

    it("give a query's result over values the GPU wrote", async () => {
        const world = createWorld({ workers: 0, resources: { gpuDevice: await device() } });
        await world.run(spawn);
        const counts: number[] = [];
        world.observe.count({ required: [heat], where: { [heat]: { ">=": 100 } } })(count => counts.push(count));
        await world.run(warm);
        expect(counts).toEqual([0, 100]);
        await world.run(warm);
        const hot = await toPromise(world.observe.select({ required: [heat], where: { [heat]: { ">=": 250 } } }));
        expect(new Set(hot)).toEqual(new Set(spawned.slice(50)));
        await world.dispose();
    });

    it("give an observer waiting for its first value nothing from a run queued before it", async () => {
        const world = createWorld({ workers: 0, resources: { gpuDevice: await device() } });
        await world.run(spawn);
        await world.run(warm);
        const running = world.run(warm);
        const seen: unknown[] = [];
        world.observe.entity(spawned[0], { required: [heat] })(value => seen.push(value));
        const counts: number[] = [];
        world.observe.count({ required: [heat], where: { [heat]: { ">=": 50 } } })(count => counts.push(count));
        await running;
        // Queued after the first values, so they've come by its end.
        await world.run(idle);
        expect(seen).toEqual([{ [heat]: 200 }]);
        expect(counts).toEqual([100]);
        await world.dispose();
    });
});
