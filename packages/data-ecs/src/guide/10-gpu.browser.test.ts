import { expect, it } from "vitest";
import { Component, System, Vec3, World } from "../index.js";

const position = "guide/gpu/position";
const velocity = "guide/gpu/velocity";

declare module "@adobe/data-ecs/components" {
    interface Types {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
    }
}
declare module "@adobe/data-ecs/systems" {
    interface Types {
        "guide/gpu/spawn": true;
        "guide/gpu/move": true;
    }
}

// GPU kernels read and write 4-byte values: numbers with precision 1, as `Vec3.schema` is.
Component.register(position, { type: Vec3.schema });
Component.register(velocity, { type: Vec3.schema });

const spawn = System.create({ name: "guide/gpu/spawn" }, (_, __, commands) => {
    for (let i = 0; i < 1000; i++) commands.spawn({ [position]: [i, 0, 0], [velocity]: [0, 1, 0] });
});

// `kernel: "gpu"` runs as a compute shader in a world with a device, and as a "cpu" kernel in one without.
const move = System.create({ name: "guide/gpu/move", kernel: "gpu", query: { read: [position, velocity], write: [position] } }, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});

it("runs GPU kernels on the world's device, and reads their writes back on request", async () => {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter?.requestDevice();
    if (device === undefined) throw new Error("No WebGPU device.");
    const world = await World.create({ gpu: { device }, systems: [spawn, move] });
    await world.run(spawn);
    await world.run(move);
    await world.run(move);
    // Values a GPU kernel wrote stay on the GPU until something on the CPU needs them, or `synchronize` asks.
    await world.synchronize([position]);
    const [first] = world.query.select([position], { order: { [position]: true } });
    expect(world.read.component(first, position)).toEqual([0, 2, 0]);
    await world.dispose();
});
