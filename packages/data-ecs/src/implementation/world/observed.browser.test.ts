import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";

const value = Symbol("observedWorkersTest/value");
const seen = Symbol("observedWorkersTest/seen");

declare module "@adobe/data-ecs" {
    export interface Components {
        [value]: { type: number };
        [seen]: { type: number };
    }
}

Component.register(value, { type: { type: "number", precision: 1 } });
Component.register(seen, { type: { type: "number", precision: 1 } });

const seed = System.create({ name: "observedWorkersTest/seed" }, ({ commands }) => {
    for (let i = 0; i < 3000; i++) commands.spawn({ [value]: i, [seen]: 0 });
});

/** Writes every value: until something observes `value`, its stamps are muted. */
const bump = System.create({ name: "observedWorkersTest/bump", kernel: "cpu", components: { write: [value] } }, row => {
    row[value] = row[value] + 1;
});

const watch = System.create({ name: "observedWorkersTest/watch", kernel: "cpu", components: { write: [seen], changed: [value] }, after: [bump] }, row => {
    row[seen] = row[seen] + 1;
});

describe("tick stamps only where observed, on workers", () => {
    for (const wasm of [false, true]) {
        it(`start once an observer registers (${wasm ? "WASM" : "JS"} kernels)`, async () => {
            const world = createWorld({ [workers]: 2 }, { wasm, minimumChunk: 64 });
            await world.run(seed);
            await world.run(bump);
            // New observers see everything once.
            await world.run(watch);
            await world.run(watch);
            const seenAll = async (): Promise<number[]> => (await readEach(world, await select(world, { required: [seen] }), seen)).map(each => each ?? -1);
            expect(new Set(await seenAll())).toEqual(new Set([1]));
            // Writes after registering are stamped, so the observer sees each exactly once.
            await world.run(bump);
            await world.run(watch);
            await world.run(watch);
            expect(new Set(await seenAll())).toEqual(new Set([2]));
            await world.dispose();
        });
    }
});
