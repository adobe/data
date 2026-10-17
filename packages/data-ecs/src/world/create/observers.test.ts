import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Resource } from "../../resource/resource.js";
import { System } from "../../system/system.js";
import { World } from "../world.js";

const level = "observersTest/level";
const other = "observersTest/other";
const total = "observersTest/total";
const weight = "observersTest/weight";

declare module "@adobe/data-ecs" {
    interface Resources {
        [level]: { type: number };
        [other]: { type: number };
        [total]: { type: number; reduce: "+" };
    }
    interface Components {
        [weight]: { type: number };
    }
}

Resource.register(level, { type: { type: "number", default: 0 } });
Resource.register(other, { type: { type: "number", default: 0 } });
Resource.register(total, { type: { type: "number", default: 0 }, reduce: "+" });
Component.register(weight, { type: { type: "number" } });

const raise = System.create({ name: "observersTest/raise", input: { type: "object", properties: { by: { type: "number" } } }, resources: { write: [level] } }, ({ input, resources }) => {
    resources[level] += input.by;
    resources[level] += input.by;
});
const touchOther = System.create({ name: "observersTest/touchOther", resources: { write: [other] } }, ({ resources }) => { resources[other] += 1; });
const spawn = System.create({ name: "observersTest/spawn" }, ({ commands }) => { commands.spawn({ [weight]: 2 }); });
const sum = System.create({ name: "observersTest/sum", components: { read: [weight] }, reduce: { [total]: "+" } }, (row, { reduce }) => { reduce[total](row[weight]); });

describe("observing resources", () => {
    it("gives the current value when subscribing, then the value after each run that changed it", async () => {
        await using world = World.create();
        const seen: number[] = [];
        world.observe.resource(level)(value => seen.push(value));
        expect(seen).toEqual([0]);
        await world.run(raise, { by: 1 });
        expect(seen).toEqual([0, 2]);
        await world.run(touchOther);
        expect(seen).toEqual([0, 2]);
        await world.run(raise, { by: 3 });
        expect(seen).toEqual([0, 2, 8]);
    });

    it("notifies a reduced resource only when its fold differs", async () => {
        await using world = World.create();
        const seen: number[] = [];
        world.observe.resource(total)(value => seen.push(value));
        await world.run(spawn);
        await world.run(sum);
        await world.run(sum);
        expect(seen).toEqual([0, 2]);
    });

    it("stops an observer that another stops while a run notifies", async () => {
        await using world = World.create();
        const seen: string[] = [];
        let stopSecond = (): void => {};
        world.observe.resource(level)(value => {
            seen.push(`first ${value}`);
            if (value > 0) stopSecond();
        });
        stopSecond = world.observe.resource(level)(value => seen.push(`second ${value}`));
        await world.run(raise, { by: 1 });
        await world.run(raise, { by: 1 });
        stopSecond();
        expect(seen).toEqual(["first 0", "second 0", "first 2", "first 4"]);
    });

    it("gives an observer added while a run notifies only the value then", async () => {
        await using world = World.create();
        const seen: string[] = [];
        world.observe.resource(level)(value => {
            if (value === 2) world.observe.resource(level)(later => seen.push(`added ${later}`));
        });
        await world.run(raise, { by: 1 });
        expect(seen).toEqual(["added 2"]);
    });

    it("throws to the subscriber when a first value throws, and reports an observer that throws while a run notifies", async () => {
        await using world = World.create();
        expect(() => world.observe.resource(level)(() => { throw new Error("first failed"); })).toThrow("first failed");
        const seen: number[] = [];
        world.observe.resource(level)(value => {
            if (value > 0) throw new Error("observer failed");
        });
        world.observe.resource(level)(value => seen.push(value));
        const { failures } = await world.run(raise, { by: 1 });
        expect(failures.map(({ kind, name, message }) => ({ kind, name, message }))).toEqual([{ kind: "observer", name: level, message: "observer failed" }]);
        expect(seen).toEqual([0, 2]);
    });
});
