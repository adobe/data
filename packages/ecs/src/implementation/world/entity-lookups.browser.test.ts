// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { edit, probe, scene, threadProbe, value } from "./entity-lookups.test-helper.js";

/** Writes every `value` on the GPU, which stamps its whole column at once. */
const bumpOnGpu = System.create({ name: "entityLookupsTest/bumpOnGpu", kernel: "gpu", components: { write: [value] } }, row => {
    row[value] = row[value] + 1;
});

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

/** Whether `probe` sees a GPU kernel's write to what its lookup watches once, run by run. */
const gpuWrites = async (world: CreatedWorld, probe: System): Promise<readonly (readonly [boolean | null, number | null])[]> => {
    await world.run(edit, { action: "spawn" });
    scene.seen = [];
    await world.run(probe);
    await world.run(probe);
    await world.run(bumpOnGpu);
    await world.run(probe);
    await world.run(probe);
    return scene.seen.map(seen => [seen.found, seen.value]);
};

const expected = [[true, 1], [false, 1], [true, 2], [false, 2]];

describe("lookups by entity with changed, after a GPU kernel's writes", () => {
    it("see them on the world's thread", async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: await device() });
        expect(await gpuWrites(world, probe)).toEqual(expected);
        await world.dispose();
    });
    it("see them on a joined thread", async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: await device() });
        const channel = new MessageChannel();
        world.share(channel.port1);
        const remote = join(channel.port2, { threads: ["entityLookupsTest"] });
        await new Promise<void>(resolve => {
            let done = false;
            const stop = world.threads(threads => {
                if (done || threads.at(-1)?.status !== "joined") return;
                done = true;
                queueMicrotask(() => stop());
                resolve();
            });
        });
        expect(await gpuWrites(world, threadProbe)).toEqual(expected);
        await remote.dispose();
        await world.dispose();
    });
});
