// © 2026 Adobe. MIT License. See /LICENSE for details.
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

const move = System.create({ kernel: "gpu", components: { with: [velocity, position] } }, row => {
    row[position] = Vec2.add(row[position], row[velocity]);
});

// Made with the app's shaders, using shaderCode, and its canvas.
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

const read = System.create({ readonly: true, components: { with: [position] } }, row => {
    console.log("at", row[position]);
});

const spawn = System.create(({ commands }) => {
    commands.spawn([position, velocity, size])({ [position]: [0, 0], [velocity]: [1, 2], [size]: 4 });
});

export const main = async (): Promise<void> => {
    // Without a device, move runs on the CPU and draw is skipped.
    await using world = World.create();
    await world.run(spawn);
    await world.run(move);
    await world.run(draw);
    await world.run(read);
    for (const accessor of shaderCode.match(/fn dot\w+\(.*?\) -> [\w<>]+/g) ?? []) console.log(accessor);
};
