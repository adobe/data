import { afterEach, describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";

const parent = Symbol("upBrowserTest/parent");
const offset = Symbol("upBrowserTest/offset");
const placed = Symbol("upBrowserTest/placed");
const marked = Symbol("upBrowserTest/marked");

declare module "@adobe/data-ecs" {
    interface Components {
        [parent]: typeof parentTraits;
        [offset]: typeof offsetTraits;
        [placed]: typeof placedTraits;
        [marked]: typeof markedTraits;
    }
}

const parentTraits = Component.register(parent, { type: Entity.schema, reference: "owner" });
const offsetTraits = Component.register(offset, { type: { type: "number", precision: 1 } });
const placedTraits = Component.register(placed, { type: { type: "number", precision: 1 } });
const markedTraits = Component.register(marked, { type: { const: true } });
import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { workers } from "../../interface/resources/workers.js";

const place = System.create({
    name: "upBrowserTest/place",
    kernel: "gpu",
    components: { read: [offset], write: [placed] },
    up: { through: parent, read: [placed] },
}, (row, { up }) => {
    row[placed] = up === null ? row[offset] : up[placed] + row[offset];
});
/** Trees whose children are in two archetypes, so a depth's rows have parents in several. */
const plant = System.create({ name: "upBrowserTest/plant" }, ({ commands }) => {
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
