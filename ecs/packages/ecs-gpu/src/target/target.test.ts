// © 2026 Adobe. MIT License. See /LICENSE for details.
import { gpuDevice, World, workers } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import * as Device from "../device/public.js";
import * as Frame from "../frame/public.js";
import { bytesIn, destroyed, firstPixel, gpu, testDevice } from "../gpu.test-helper.js";
import { despawn, setClear, spawnTarget, targetStates } from "../test-systems.test-helper.js";
import * as Target from "./public.js";

describe("render targets", () => {
    it.runIf(gpu)("get textures of their size and options on the world's device", async () => {
        const device = await testDevice();
        await using world = World.create({ [workers]: 0, [gpuDevice]: device });
        const target = await world.run(spawnTarget, { width: 8, height: 4, sampleCount: 4 });
        await world.run(Frame.update);
        const state = (await world.run(targetStates))?.get(target);
        expect(state?.device).toBe(device);
        expect([state?.color.width, state?.color.height, state?.color.sampleCount, state?.color.format]).toEqual([8, 4, 1, navigator.gpu.getPreferredCanvasFormat()]);
        expect([state?.multisampled?.sampleCount, state?.depth?.format, state?.depth?.sampleCount]).toEqual([4, "depth24plus", 4]);
    });

    it.runIf(gpu)("are cleared each frame to their color, multisampled ones resolving into their color", async () => {
        const device = await testDevice();
        await using world = World.create({ [workers]: 0, [gpuDevice]: device });
        const single = await world.run(spawnTarget, { width: 2, height: 2, clear: [1, 0, 0, 1] });
        const multisampled = await world.run(spawnTarget, { width: 2, height: 2, clear: [0, 1, 0, 1], sampleCount: 4 });
        await world.run(Frame.systems);
        const states = await world.run(targetStates);
        const [singleState, multisampledState] = [states?.get(single), states?.get(multisampled)];
        if (singleState === undefined || multisampledState === undefined) throw new Error("The targets have no state.");
        expect(await firstPixel(device, singleState.color)).toEqual(bytesIn(singleState.format, [255, 0, 0, 255]));
        expect(await firstPixel(device, multisampledState.color)).toEqual(bytesIn(multisampledState.format, [0, 255, 0, 255]));
        await world.run(setClear, { target: single, clear: [0, 0, 1, 1] });
        await world.run(Frame.systems);
        const recleared = (await world.run(targetStates))?.get(single);
        if (recleared === undefined) throw new Error("The target has no state.");
        expect(await firstPixel(device, recleared.color)).toEqual(bytesIn(recleared.format, [0, 0, 255, 255]));
    });

    it.runIf(gpu)("get new textures when resized, destroying those they replace", async () => {
        const device = await testDevice();
        await using world = World.create({ [workers]: 0, [gpuDevice]: device });
        const target = await world.run(spawnTarget, { width: 8, height: 4 });
        await world.run(Frame.update);
        const before = (await world.run(targetStates))?.get(target);
        await world.run(Target.resize, { target, width: 16.7, height: 0 });
        await world.run(Frame.update);
        const after = (await world.run(targetStates))?.get(target);
        expect([after?.size, after?.color.width, after?.color.height]).toEqual([[16, 1], 16, 1]);
        if (before === undefined || after === undefined) throw new Error("The target has no state.");
        expect(await destroyed(device, before.color)).toBe(true);
        expect(await destroyed(device, after.color)).toBe(false);
    });

    it.runIf(gpu)("follow the world's device: made again on a new one, none without one", async () => {
        const first = await testDevice();
        const second = await testDevice();
        await using world = World.create({ [workers]: 0, [gpuDevice]: first });
        const target = await world.run(spawnTarget, { width: 4, height: 4 });
        await world.run(Frame.update);
        const onFirst = (await world.run(targetStates))?.get(target);
        await world.run(Device.set, { device: second });
        await world.run(Frame.update);
        const onSecond = (await world.run(targetStates))?.get(target);
        expect(onSecond?.device).toBe(second);
        if (onFirst === undefined || onSecond === undefined) throw new Error("The target has no state.");
        expect(await destroyed(first, onFirst.color)).toBe(true);
        await world.run(Device.set, { device: null });
        await world.run(Frame.update);
        expect((await world.run(targetStates))?.size).toBe(0);
        expect(await destroyed(second, onSecond.color)).toBe(true);
    });

    it.runIf(gpu)("have no textures once their device is lost", async () => {
        const device = await testDevice();
        await using world = World.create({ [workers]: 0, [gpuDevice]: device });
        await world.run(spawnTarget, { width: 4, height: 4 });
        await world.run(Frame.systems);
        device.destroy();
        await device.lost;
        await world.run(Frame.systems);
        await world.run(Frame.systems);
        expect((await world.run(targetStates))?.size).toBe(0);
    });

    it.runIf(gpu)("release their textures when despawned, and when the world is disposed", async () => {
        const device = await testDevice();
        const world = World.create({ [workers]: 0, [gpuDevice]: device });
        const gone = await world.run(spawnTarget, { width: 4, height: 4 });
        const kept = await world.run(spawnTarget, { width: 4, height: 4 });
        await world.run(Frame.update);
        const states = await world.run(targetStates);
        const [goneState, keptState] = [states?.get(gone), states?.get(kept)];
        if (goneState === undefined || keptState === undefined) throw new Error("The targets have no state.");
        await world.run(despawn, { entity: gone });
        expect(await destroyed(device, goneState.color)).toBe(true);
        expect([...(await world.run(targetStates))?.keys() ?? []]).toEqual([kept]);
        expect(await destroyed(device, keptState.color)).toBe(false);
        await world.dispose();
        expect(await destroyed(device, keptState.color)).toBe(true);
    });
});
