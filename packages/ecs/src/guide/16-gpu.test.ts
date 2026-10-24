// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { type F32, Gpu, System, Vec2, World } from "../index.js";

const position = Symbol();
const velocity = Symbol();
const size = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec2 };
        [velocity]: { type: Vec2 };
        [size]: { type: F32 };
    }
}

// kernel: "gpu" runs the body as a compute shader over the GPU's copy of its components, in a world given a device
// (World.create({ [gpuDevice]: device })), and as a kernel on the CPU in one without. Its rows hold 32-bit numbers
// and vectors of them; it has no lookups, change filters or commands.
const move = System.create({ kernel: "gpu", components: { with: [velocity, position] } }, row => {
    row[position] = Vec2.add(row[position], row[velocity]);
});

// A render system records draws over the GPU copy of the components its accessors name, in a world with a device.
// Gpu.wgsl(draw) gives its shaders a function per accessor, `fn dotPosition(row: u32) -> vec2<f32>`, and
// Gpu.layout(device) the bind group layout its pipeline takes. Each table is a group of matching rows to draw.
let pipeline: GPURenderPipeline | null = null;
let target: GPUTextureView | null = null;
const draw = System.render({ shader: { accessors: { dotPosition: position, dotSize: size } } }, ({ encoder, tables }) => {
    if (pipeline === null || target === null) return;
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: "clear", storeOp: "store" }] });
    pass.setPipeline(pipeline);
    for (const table of tables) {
        table.bind(pass);
        pass.draw(6, table.count);
    }
    pass.end();
});
const shaderCode = Gpu.wgsl(draw);

const positions: Vec2[] = [];
const read = System.create({ observer: true, components: { with: [position] } }, row => {
    positions.push(row[position]);
});

const spawn = System.create(({ commands }) => {
    commands.spawn([position, velocity, size])({ [position]: [0, 0], [velocity]: [1, 2], [size]: 4 });
});

it("runs GPU kernels on the CPU without a device, and skips render systems", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(move);
    await world.run(draw);
    await world.run(read);
    expect(positions).toEqual([[1, 2]]);
    expect(shaderCode).toContain("fn dotPosition(row: u32) -> vec2<f32>");
});
