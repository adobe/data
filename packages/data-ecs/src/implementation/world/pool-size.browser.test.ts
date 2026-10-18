import { afterEach, describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { toPromise } from "../../interface/observe/to-promise.js";

const value = Symbol("poolSizeTest/value");
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
const resize = System.create({ name: "poolSizeTest/resize", input: { type: "object", properties: { size: { anyOf: [{ type: "integer" }, { type: "null" }] } } }, resources: { write: [workers] } }, ({ input, resources }) => {
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
    it("is null by default, the platform's choice: a worker per hardware thread but the world's", async () => {
        const world = createWorld({}, { minimumChunk: 64 });
        expect(await toPromise(world.observe.resource(workers))).toBe(null);
        await world.run(seed);
        await world.run(double);
        expect(started).toBe(Math.max(1, navigator.hardwareConcurrency - 1));
        await world.dispose();
    });
    it("honors a number, and null again gives the platform's choice", async () => {
        const world = createWorld({ [workers]: 1 }, { minimumChunk: 64 });
        await world.run(seed);
        await world.run(double);
        expect(started).toBe(1);
        await world.run(resize, { size: null });
        await world.run(double);
        expect(started).toBe(1 + Math.max(1, navigator.hardwareConcurrency - 1));
        await world.dispose();
    });
    it("sizes the kernel pool at the next sync point, with the same results", async () => {
        const world = createWorld({ [workers]: 2 }, { minimumChunk: 64 });
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
