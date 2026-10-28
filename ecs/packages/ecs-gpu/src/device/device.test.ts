// © 2026 Adobe. MIT License. See /LICENSE for details.
import { World, workers } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import { gpu } from "../gpu.test-helper.js";
import { currentDevice } from "../test-systems.test-helper.js";
import * as Device from "./public.js";

/** Resolves once the world's device is one other than `than`. */
const another = async (world: World, than: GPUDevice | null): Promise<GPUDevice | null> => {
    for (;;) {
        const device = await world.run(currentDevice);
        if (device !== than && device !== null) return device;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
};

describe("devices", () => {
    it.runIf(gpu)("are requested with the adapter's options and the device's features", async () => {
        const device = await Device.request({ powerPreference: "low-power", requiredFeatures: [] });
        expect(device).not.toBeNull();
        device?.destroy();
    });

    it.runIf(gpu)("are null where the adapter can't give one", async () => {
        expect(await Device.request({ requiredLimits: { maxTextureDimension2D: 2 ** 31 } })).toBeNull();
    });

    it.runIf(gpu)("are kept: a lost device is replaced, until keeping stops", async () => {
        await using world = World.create({ [workers]: 0 });
        const kept = await Device.keep(world);
        expect(kept.supplied).toBe(true);
        const first = await world.run(currentDevice);
        first?.destroy();
        const second = await another(world, first);
        expect(second).not.toBe(first);
        kept.stop();
        second?.destroy();
        await second?.lost;
        await world.run(currentDevice);
        await world.run(currentDevice);
        expect(await world.run(currentDevice)).toBeNull();
    });
});
