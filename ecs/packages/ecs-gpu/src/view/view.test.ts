// © 2026 Adobe. MIT License. See /LICENSE for details.
import { gpuDevice, System, World, workers } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import { perDevice } from "../cache/cache.js";
import * as Frame from "../frame/public.js";
import { bytesIn, gpu, testDevice } from "../gpu.test-helper.js";
import { despawn, spawnTarget, spawnView, targetStates, viewStates } from "../test-systems.test-helper.js";
import * as Target from "../target/public.js";
import * as View from "./public.js";

/** A triangle covering the view, colored by the view's size in pixels: red its width, green its height. */
const shader = `${View.wgsl(0)}
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
    let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
    return view.projection * vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn fragmentMain() -> @location(0) vec4f { return vec4f(view.size / 255.0, 0.0, 1.0); }
`;

const pipelines = perDevice((device: GPUDevice, format: GPUTextureFormat) => {
    const module = device.createShaderModule({ code: shader });
    return device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [View.layout(device)] }),
        vertex: { module, entryPoint: "vertexMain" },
        fragment: { module, entryPoint: "fragmentMain", targets: [{ format }] },
        depthStencil: { format: "depth24plus", depthCompare: "always", depthWriteEnabled: false },
    });
}, format => format);

/** Draws every view. */
const draw = System.render({ shader: { accessors: {} }, components: { with: [View.target] }, after: [Frame.update], before: [Frame.present] }, ({ device, encoder }, { resources }) => {
    for (const view of resources[View.states]?.values() ?? []) {
        const pass = View.begin(encoder, view);
        pass.setPipeline(pipelines(device, view.target.format));
        pass.setBindGroup(0, view.bindGroup);
        pass.draw(3);
        pass.end();
    }
});

/** Every pixel of a texture of 4-byte texels, by `x`, `y`. */
const pixels = async (device: GPUDevice, texture: GPUTexture): Promise<(x: number, y: number) => readonly number[]> => {
    const buffer = device.createBuffer({ size: 256 * texture.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: 256 }, [texture.width, texture.height]);
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(buffer.getMappedRange().slice(0));
    buffer.destroy();
    return (x, y) => [...bytes.subarray(y * 256 + x * 4, y * 256 + x * 4 + 4)];
};

describe("views", () => {
    it.runIf(gpu)("draw into their part of their target, each binding its own size", async () => {
        const device = await testDevice();
        await using world = World.create({ [workers]: 0, [gpuDevice]: device });
        const target = await world.run(spawnTarget, { width: 8, height: 4, clear: [0, 0, 1, 1] });
        const left = await world.run(spawnView, { target, viewport: [0, 0, 0.5, 1] });
        const corner = await world.run(spawnView, { target, viewport: [0.75, 0.5, 0.25, 0.5] });
        await world.run(System.create({ systems: [Frame.systems, draw] }));
        const views = await world.run(viewStates);
        expect([views?.get(left)?.rectangle, views?.get(corner)?.rectangle]).toEqual([[0, 0, 4, 4], [6, 2, 2, 2]]);
        const state = (await world.run(targetStates))?.get(target);
        if (state === undefined) throw new Error("The target has no state.");
        const at = await pixels(device, state.color);
        expect([at(0, 0), at(3, 3)]).toEqual([bytesIn(state.format, [4, 4, 0, 255]), bytesIn(state.format, [4, 4, 0, 255])]);
        expect([at(4, 0), at(5, 3), at(6, 1)]).toEqual([bytesIn(state.format, [0, 0, 255, 255]), bytesIn(state.format, [0, 0, 255, 255]), bytesIn(state.format, [0, 0, 255, 255])]);
        expect(at(7, 3)).toEqual(bytesIn(state.format, [2, 2, 0, 255]));
    });

    it.runIf(gpu)("follow their target's size and go with their target", async () => {
        const device = await testDevice();
        await using world = World.create({ [workers]: 0, [gpuDevice]: device });
        const target = await world.run(spawnTarget, { width: 8, height: 4 });
        const view = await world.run(spawnView, { target, viewport: [0.5, 0, 0.5, 0.5] });
        await world.run(Frame.systems);
        const before = (await world.run(viewStates))?.get(view);
        await world.run(Target.resize, { target, width: 20, height: 10 });
        await world.run(Frame.systems);
        const after = (await world.run(viewStates))?.get(view);
        expect([before?.rectangle, after?.rectangle]).toEqual([[4, 0, 4, 2], [10, 0, 10, 5]]);
        expect(after?.buffer).toBe(before?.buffer);
        await world.run(despawn, { entity: target });
        expect((await world.run(viewStates))?.size).toBe(0);
    });
});
