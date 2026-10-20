import { Component } from "../interface/component/component.js";
import type { Entity } from "../interface/entity/entity.js";
import { gpuDevice } from "../interface/resources/gpu-device.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import { createWorld } from "../implementation/world/create.js";
import { Observe } from "../observe/index.js";
import type { Benchmark } from "./benchmark.js";

// An entity observer factory of values a GPU kernel writes: each run reads back what the observer reads.

const heat = Symbol("observedGpu/heat");
const rate = Symbol("observedGpu/rate");
declare module "@adobe/data-ecs" {
    export interface Components {
        [heat]: { type: number };
        [rate]: { type: number };
    }
}
Component.register(heat, { type: { type: "number", precision: 1 } });
Component.register(rate, { type: { type: "number", precision: 1 } });

const heated = 100_000;
let spawned: Entity[] = [];
const spawn = System.create({ name: "observedGpu/spawn" }, ({ commands }) => {
    spawned = [];
    for (let i = 0; i < heated; i++) spawned.push(commands.spawn([heat, rate])({ [heat]: 0, [rate]: 1 }));
});
const warm = System.create({ name: "observedGpu/warm", kernel: "gpu", components: { read: [rate], write: [heat] } }, row => {
    row[heat] = row[heat] + row[rate];
});

/** Timed per run by `timed`, which waits for the GPU. */
export const observedGpuBenchmarks = (device: GPUDevice, timed: (run: () => Promise<unknown>) => Promise<number>): readonly Benchmark[] => [{
    name: "observe gpu entity factory",
    operation: "A GPU kernel writing a value of 100K entities, one entity of which is observed through the observer factories: each run reads that storage back for it.",
    per: "runs",
    n: 1,
    typical: [1, 1],
    best: { bytes: 400_000, basis: "The readback copies the observed storage's 100K 4-byte values.", on: "gpu" },
    run: async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: device });
        try {
            await world.run(spawn);
            let notified = 0;
            const stop = Observe.entity(world, spawned[0], { required: [heat] })(() => { notified++; });
            await world.run(warm);
            const before = notified;
            const best = await timed(() => world.run(warm));
            if (notified <= before) throw new Error("observe gpu entity factory: not notified");
            stop();
            return best;
        }
        finally {
            await world.dispose();
        }
    },
}];
