// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, describe, expect, it } from "vitest";
import { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";

const parent = Symbol("upBrowserTest/parent");
const offset = Symbol("upBrowserTest/offset");
const placed = Symbol("upBrowserTest/placed");
const marked = Symbol("upBrowserTest/marked");

declare module "@adobe/ecs" {
    interface Components {
        [parent]: { type: Entity; reference: "owner" };
        [offset]: { type: F32 };
        [placed]: { type: F32 };
        [marked]: { type: true };
    }
}

import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { workers } from "../../interface/resources/workers.js";
import type { F32 } from "../../interface/math/index.js";

const place = System.create({
    kernel: "gpu",
    components: { with: [offset, placed] },
    up: { through: parent },
}, (row, { up }) => {
    row[placed] = up === null ? row[offset] : up[placed] + row[offset];
});
/** Trees whose children are in two archetypes, so a depth's rows have parents in several. */
const plant = System.create({}, ({ commands }) => {
    for (let tree = 0; tree < 50; tree++) {
        let level = [commands.spawn([offset, placed])({ [offset]: tree, [placed]: 0 })];
        for (let depth = 1; depth < 12; depth++) {
            const next = [];
            for (const at of level.slice(0, 2)) {
                next.push(commands.spawn([offset, placed, parent])({ [offset]: depth, [placed]: 0, [parent]: at }));
                next.push(commands.spawn([offset, placed, parent, marked])({ [offset]: -1, [placed]: 0, [parent]: at, [marked]: true }));
            }
            level = next;
        }
    }
});

const disposals: World[] = [];
afterEach(async () => {
    await Promise.all(disposals.splice(0).map(item => item.dispose()));
});

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

const placements = async (gpu: GPUDevice | null): Promise<readonly (number | null)[]> => {
    const ecs = createWorld({ [workers]: 0, [gpuDevice]: gpu });
    disposals.push(ecs);
    await ecs.run(plant);
    await ecs.run(place);
    await ecs.run(place);
    return (await readEach(ecs, await select(ecs, { required: [placed] }), placed)).sort((a, b) => (a ?? 0) - (b ?? 0));
};

describe("up on the GPU", () => {
    it("runs depth by depth, a dispatch per group, as on the CPU", async () => {
        const cpu = await placements(null);
        expect(await placements(await device())).toEqual(cpu);
    });
});
