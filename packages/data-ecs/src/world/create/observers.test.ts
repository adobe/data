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

/** Lets queued work run: a world delivers a new observer's first value through its queue. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe("observing resources", () => {
    it("gives the current value soon after subscribing, never during it, then the value after each run that changed it", async () => {
        await using world = World.create();
        const seen: number[] = [];
        world.observe.resource(level)(value => seen.push(value));
        expect(seen).toEqual([]);
        await settle();
        expect(seen).toEqual([0]);
        await world.run(raise, { by: 1 });
        expect(seen).toEqual([0, 2]);
        await world.run(touchOther);
        expect(seen).toEqual([0, 2]);
        await world.run(raise, { by: 3 });
        expect(seen).toEqual([0, 2, 8]);
    });

    it("waits for a run in progress before giving the first value", async () => {
        await using world = World.create();
        const seen: number[] = [];
        const running = world.run(raise, { by: 1 });
        world.observe.resource(level)(value => seen.push(value));
        await running;
        expect(seen).toEqual([]);
        await settle();
        expect(seen).toEqual([2]);
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

    it("gives nothing to an observer stopped before its first value", async () => {
        await using world = World.create();
        const seen: number[] = [];
        const stop = world.observe.resource(level)(value => seen.push(value));
        stop();
        stop();
        await settle();
        await world.run(raise, { by: 1 });
        expect(seen).toEqual([]);
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
        await settle();
        await world.run(raise, { by: 1 });
        await world.run(raise, { by: 1 });
        expect(seen).toEqual(["first 0", "second 0", "first 2", "first 4"]);
    });

    it("gives an observer added while a run notifies the value after that run once", async () => {
        await using world = World.create();
        const seen: string[] = [];
        let added = false;
        world.observe.resource(level)(value => {
            if (value === 0 || added) return;
            added = true;
            world.observe.resource(level)(later => seen.push(`added ${later}`));
        });
        await settle();
        await world.run(raise, { by: 1 });
        await settle();
        expect(seen).toEqual(["added 2"]);
    });

    it("reports an observer that throws, in its run's report or, for its first value, the next run's", async () => {
        await using world = World.create();
        const seen: number[] = [];
        world.observe.resource(level)(() => { throw new Error("observer failed"); });
        world.observe.resource(level)(value => seen.push(value));
        await settle();
        const first = await world.run(touchOther);
        const second = await world.run(raise, { by: 1 });
        for (const { failures } of [first, second]) expect(failures.map(({ kind, name, message }) => ({ kind, name, message }))).toEqual([{ kind: "observer", name: level, message: "observer failed" }]);
        expect(seen).toEqual([0, 2]);
    });
});
