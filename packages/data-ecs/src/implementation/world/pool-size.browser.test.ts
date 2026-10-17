import { afterEach, describe, expect, it } from "vitest";
import { Component } from "../../types/component/component.js";
import { workers } from "../../types/resources/workers.js";
import { System } from "../../types/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";

const value = "poolSizeTest/value";
declare module "@adobe/data-ecs" {
    export interface Components {
        [value]: { type: number };
    }
}
Component.register(value, { type: { type: "number", precision: 1 } });

const seed = System.create({ name: "poolSizeTest/seed" }, ({ commands }) => {
    for (let i = 0; i < 4096; i++) commands.spawn({ [value]: i });
});
const double = System.create({ name: "poolSizeTest/double", kernel: "cpu", components: { write: [value] } }, row => { row[value] = row[value] * 2; });
const resize = System.create({ name: "poolSizeTest/resize", input: { type: "object", properties: { size: { type: "integer" } } }, resources: { write: [workers] } }, ({ input, resources }) => {
    resources[workers] = input.size;
});

/** Counts the workers the world starts, by wrapping the platform's constructor. */
const original = globalThis.Worker;
let started = 0;
const counting = function (this: unknown, url: string | URL, options?: WorkerOptions): Worker {
    started++;
    return new original(url, options);
};
Reflect.set(globalThis, "Worker", counting);
afterEach(() => { started = 0; });

describe("the workers resource", () => {
    it("sizes the kernel pool at the next sync point, with the same results", async () => {
        const world = createWorld({ workers: 2 }, { minimumChunk: 64 });
        await world.run(seed);
        await world.run(double);
        expect(started).toBe(2);
        await world.run(resize, { size: 3 });
        await world.run(double);
        expect(started).toBe(5);
        await world.run(resize, { size: 0 });
        await world.run(double);
        expect(started).toBe(5);
        const entities = await select(world, { required: [value] });
        const values = await readEach(world, entities, value);
        expect(values.slice(0, 4)).toEqual([0, 8, 16, 24]);
        expect(values[4095]).toBe(4095 * 8);
        await world.dispose();
    });
});
