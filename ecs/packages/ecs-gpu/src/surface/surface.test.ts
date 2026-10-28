// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type F32, gpuDevice, System, World, workers } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import * as Device from "../device/public.js";
import * as Frame from "../frame/public.js";
import { bytesIn, canvasPixels, gpu, paintRows, testDevice } from "../gpu.test-helper.js";
import { despawn, surfaceStates } from "../test-systems.test-helper.js";
import * as Target from "../target/public.js";
import * as Surface from "./public.js";

/** What a GPU kernel counts, which a CPU system reads back, making a run wait for the GPU between two draws. */
const counter = Symbol("surfaceTest/counter");

declare module "@adobe/ecs" {
    interface Components {
        [counter]: { type: F32 };
    }
}

const spawnCounter = System.create(({ commands }) => { commands.spawn([counter])({ [counter]: 0 }); });
const count = System.create({ kernel: "gpu", components: { with: [counter] }, after: [Frame.update] }, row => { row[counter] = row[counter] + 1; });
let counted = 0;
const readCount = System.create({ components: { with: [counter] }, after: [count] }, row => { counted = row[counter]; });

/** Paints the top two rows of every surface's target red, before the count. */
const paintTop = System.render({ components: { with: [Surface.canvas] }, shader: { accessors: {} }, after: [Frame.update], before: [count, Frame.present] }, ({ device, encoder }, { resources }) => {
    for (const target of resources[Target.states]?.values() ?? []) paintRows(device, encoder, target.color, 0, 2, bytesIn(target.format, [255, 0, 0, 255]));
});
/** Paints the bottom two rows green, once the count was read back. */
const paintBottom = System.render({ components: { with: [Surface.canvas] }, shader: { accessors: {} }, after: [readCount], before: [Frame.present] }, ({ device, encoder }, { resources }) => {
    for (const target of resources[Target.states]?.values() ?? []) paintRows(device, encoder, target.color, 2, 2, bytesIn(target.format, [0, 255, 0, 255]));
});

const cleared = (clear: readonly [number, number, number, number]): Target.Options => ({ ...Target.Options.default, clear });

describe("surfaces", () => {
    it.runIf(gpu)("present each of several canvases from its own target, sized as their targets", async () => {
        const device = await testDevice();
        await using world = World.create({ [workers]: 0, [gpuDevice]: device });
        const [first, second] = [new OffscreenCanvas(1, 1), new OffscreenCanvas(1, 1)];
        const red = await world.run(Surface.attach, { canvas: first, width: 6, height: 3, target: cleared([1, 0, 0, 1]) });
        const blue = await world.run(Surface.attach, { canvas: second, width: 2, height: 5, target: cleared([0, 0, 1, 1]) });
        await world.run(Frame.systems);
        expect([first.width, first.height, second.width, second.height]).toEqual([6, 3, 2, 5]);
        expect(canvasPixels(first)(5, 2)).toEqual([255, 0, 0, 255]);
        expect(canvasPixels(second)(1, 4)).toEqual([0, 0, 255, 255]);
        const states = await world.run(surfaceStates);
        expect([states?.get(red)?.canvas, states?.get(blue)?.canvas]).toEqual([first, second]);
    });

    it.runIf(gpu)("present every draw of a run, also where the run waited for the GPU between them", async () => {
        const device = await testDevice();
        await using world = World.create({ [workers]: 0, [gpuDevice]: device });
        const canvas = new OffscreenCanvas(1, 1);
        await world.run(Surface.attach, { canvas, width: 4, height: 4 });
        await world.run(spawnCounter);
        await world.run(System.create({ systems: [Frame.systems, paintTop, count, readCount, paintBottom] }));
        expect(counted).toBe(1);
        const shown = canvasPixels(canvas);
        expect([shown(0, 0), shown(3, 3)]).toEqual([[255, 0, 0, 255], [0, 255, 0, 255]]);
    });

    it.runIf(gpu)("size their canvases as their targets are resized, and unconfigure them once despawned", async () => {
        const device = await testDevice();
        await using world = World.create({ [workers]: 0, [gpuDevice]: device });
        const canvas = new OffscreenCanvas(1, 1);
        const surface = await world.run(Surface.attach, { canvas, width: 3, height: 3 });
        await world.run(Frame.systems);
        await world.run(Target.resize, { target: surface, width: 9, height: 7 });
        await world.run(Frame.systems);
        expect([canvas.width, canvas.height]).toEqual([9, 7]);
        const context = (await world.run(surfaceStates))?.get(surface)?.context;
        await world.run(despawn, { entity: surface });
        expect((await world.run(surfaceStates))?.size).toBe(0);
        expect(() => context?.getCurrentTexture()).toThrow();
    });

    it.runIf(gpu)("are unconfigured when their device is lost, and configured again on the next", async () => {
        const first = await testDevice();
        const second = await testDevice();
        await using world = World.create({ [workers]: 0, [gpuDevice]: first });
        const canvas = new OffscreenCanvas(1, 1);
        const surface = await world.run(Surface.attach, { canvas, width: 2, height: 2, target: cleared([0, 1, 0, 1]) });
        await world.run(Frame.systems);
        first.destroy();
        await first.lost;
        await world.run(Frame.systems);
        await world.run(Frame.systems);
        expect((await world.run(surfaceStates))?.size).toBe(0);
        await world.run(Device.set, { device: second });
        await world.run(Frame.systems);
        expect((await world.run(surfaceStates))?.get(surface)?.device).toBe(second);
        expect(canvasPixels(canvas)(1, 1)).toEqual([0, 255, 0, 255]);
    });
});
