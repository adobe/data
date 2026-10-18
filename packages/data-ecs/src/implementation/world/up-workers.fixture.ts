import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { countingWorkers } from "./platforms.test-helper.js";

/** Scenarios of `up` across workers, run built in node and from source in chromium. */

const local = Symbol("upWorkersTest/local");
const world = Symbol("upWorkersTest/world");
const parent = Symbol("upWorkersTest/parent");

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
    name: "upWorkersTest/propagate",
    kernel: "cpu",
    components: { read: [local], write: [world], changed: [local] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    row[world] = (up === null ? 0 : up[world]) + row[local] * 2;
});
/** 100 trees, each a root with 40 levels of two children, ordered so storage order isn't depth order. */
const grow = System.create({ name: "upWorkersTest/grow" }, ({ commands }) => {
    for (let tree = 0; tree < 100; tree++) {
        let level = [commands.spawn([local, world])({ [local]: tree, [world]: 0 })];
        for (let depth = 1; depth < 40; depth++) {
            const at = level[depth % level.length];
            level = [commands.spawn([local, world, parent])({ [local]: depth, [world]: 0, [parent]: at }), commands.spawn([local, world, parent])({ [local]: -depth, [world]: 0, [parent]: at })];
        }
    }
});
const nudge = System.create({ name: "upWorkersTest/nudge", components: { write: [local] } }, row => {
    if (row[local] === 7) row[local] = 70;
});

/** Values after `propagate` runs around a nudge, sorted, and the windows opened on workers meanwhile. */
export const simulate = async (count: number, wasm: boolean): Promise<{ readonly values: readonly (number | null)[]; readonly windows: number }> => {
    const counting = countingWorkers();
    const ecs = createWorld({ [workers]: count }, { minimumChunk: 64, wasm, pool: counting.platform });
    try {
        await ecs.run(grow);
        const before = counting.posted("window");
        await ecs.run(propagate);
        await ecs.run(nudge);
        await ecs.run(propagate);
        await ecs.run(propagate);
        const windows = counting.posted("window") - before;
        const values = (await readEach(ecs, await select(ecs, { required: [world] }), world)).sort((a, b) => (a ?? 0) - (b ?? 0));
        return { values, windows };
    }
    finally {
        await ecs.dispose();
    }
};
