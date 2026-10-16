import { afterEach, describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Entity } from "../../entity/entity.js";
import { System } from "../../system/system.js";
import type { World } from "../world.js";
import { createWorld } from "./create.js";

const local = "upBrowserTest/local";
const world = "upBrowserTest/world";
const parent = "upBrowserTest/parent";

declare module "@adobe/data-ecs" {
    interface Components {
        [local]: { type: number };
        [world]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
    }
}

Component.register(local, { type: { type: "number" } });
Component.register(world, { type: { type: "number" } });
Component.register(parent, { type: Entity.schema, reference: "owner" });

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
    const ecs = createWorld({ workers, minimumChunk: 64, wasm });
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
    const values = ecs.query.select([world]).map(entity => ecs.read.component(entity, world)).sort((a, b) => (a ?? 0) - (b ?? 0));
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
