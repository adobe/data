import { afterEach, describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";

const local = "upBrowserTest/local";
const world = "upBrowserTest/world";
const parent = "upBrowserTest/parent";
const offset = "upBrowserTest/offset";
const placed = "upBrowserTest/placed";
const marked = "upBrowserTest/marked";

declare module "@adobe/data-ecs" {
    interface Components {
        [local]: { type: number };
        [world]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
        [offset]: { type: number };
        [placed]: { type: number };
        [marked]: { type: true };
    }
}

Component.register(local, { type: { type: "number" } });
Component.register(world, { type: { type: "number" } });
Component.register(parent, { type: Entity.schema, reference: "owner" });
Component.register(offset, { type: { type: "number", precision: 1 } });
Component.register(placed, { type: { type: "number", precision: 1 } });
Component.register(marked, { type: { const: true } });
import { gpuDevice } from "../../interface/resources/gpu-device.js";

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
        let level = [commands.spawn({ [offset]: tree, [placed]: 0 })];
        for (let depth = 1; depth < 12; depth++) {
            const next = [];
            for (const at of level.slice(0, 2)) {
                next.push(commands.spawn({ [offset]: depth, [placed]: 0, [parent]: at }));
                next.push(commands.spawn({ [offset]: -1, [placed]: 0, [parent]: at, [marked]: true }));
            }
            level = next;
        }
    }
});

const propagate = System.create({
    name: "upBrowserTest/propagate",
    kernel: "cpu",
    components: { read: [local], write: [world], changed: [local] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    row[world] = (up === null ? 0 : up[world]) + row[local] * 2;
});
/** 100 trees, each a root with 40 levels of two children, ordered so storage order isn't depth order. */
const grow = System.create({ name: "upBrowserTest/grow" }, ({ commands }) => {
    for (let tree = 0; tree < 100; tree++) {
        let level = [commands.spawn({ [local]: tree, [world]: 0 })];
        for (let depth = 1; depth < 40; depth++) {
            const at = level[depth % level.length];
            level = [commands.spawn({ [local]: depth, [world]: 0, [parent]: at }), commands.spawn({ [local]: -depth, [world]: 0, [parent]: at })];
        }
    }
});
const nudge = System.create({ name: "upBrowserTest/nudge", components: { write: [local] } }, row => {
    if (row[local] === 7) row[local] = 70;
});

const disposals: World[] = [];
afterEach(async () => {
    await Promise.all(disposals.splice(0).map(item => item.dispose()));
});

const simulate = async (workers: number, wasm: boolean): Promise<{ readonly values: readonly (number | null)[]; readonly windows: number }> => {
    const ecs = createWorld({ workers }, { minimumChunk: 64, wasm });
    disposals.push(ecs);
    await ecs.run(grow);
    let windows = 0;
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
        if (typeof message === "object" && message !== null && Reflect.get(message, "kind") === "window") windows++;
        return Reflect.apply(original, this, transfer === undefined ? [message] : [message, transfer]);
    };
    try {
        await ecs.run(propagate);
        await ecs.run(nudge);
        await ecs.run(propagate);
        await ecs.run(propagate);
    }
    finally {
        Worker.prototype.postMessage = original;
    }
    const values = (await readEach(ecs, await select(ecs, { required: [world] }), world)).sort((a, b) => (a ?? 0) - (b ?? 0));
    return { values, windows };
};

describe("up", () => {
    it("runs depth by depth across workers, as on the main thread alone", async () => {
        const alone = await simulate(0, false);
        const parallel = await simulate(2, true);
        expect(parallel.values).toEqual(alone.values);
        expect(parallel.windows).toBeGreaterThan(0);
    });
});

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

const placements = async (gpu: GPUDevice | null): Promise<readonly (number | null)[]> => {
    const ecs = createWorld({ workers: 0, [gpuDevice]: gpu });
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
