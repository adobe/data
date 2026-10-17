import { expect, it } from "vitest";
import { Component, System, Vec3, World, gpuDevice } from "../index.js";
import { toPromise } from "../types/observe/to-promise.js";
import { createWorld } from "../implementation/index.js";

const position = "guide/gpu/position";
const velocity = "guide/gpu/velocity";

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
    }
}

// GPU kernels read and write 4-byte values: numbers with precision 1, as `Vec3.schema` is.
Component.register(position, { type: Vec3.schema });
Component.register(velocity, { type: Vec3.schema });

const spawn = System.create({ name: "guide/gpu/spawn" }, ({ commands }) => {
    for (let i = 0; i < 1000; i++) commands.spawn({ [position]: [i, 0, 0], [velocity]: [0, 1, 0] });
});

// `kernel: "gpu"` runs as a compute shader in a world with a device, and as a "cpu" kernel in one without.
const move = System.create({ name: "guide/gpu/move", kernel: "gpu", components: { read: [velocity], write: [position] } }, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});

it("runs GPU kernels on the world's device, and reads their writes back for observers", async () => {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter?.requestDevice();
    if (device === undefined) throw new Error("No WebGPU device.");
    const world = createWorld({ gpuDevice: device });
    expect(await toPromise(world.observe.resource(gpuDevice))).toBe(device);
    await world.run(spawn);
    await world.run(move);
    await world.run(move);
    // Values a GPU kernel wrote stay on the GPU until something on the CPU needs them; an observer's are read back first.
    const [first] = await toPromise(world.observe.select({ required: [position], order: { [position]: true } }));
    expect((await toPromise(world.observe.entity(first, { required: [position] })))?.[position]).toEqual([0, 2, 0]);
    await world.dispose();
});
