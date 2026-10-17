import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Entity } from "../../entity/entity.js";
import { Resource } from "../../resource/resource.js";
import { System } from "../../system/system.js";
import { World } from "../world.js";
import { createObservers } from "./observers.js";
import { createState } from "./state.js";

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

const heat = "observersTest/heat";
const tag = "observersTest/tag";
const flag = "observersTest/flag";
const filler = "observersTest/filler";

declare module "@adobe/data-ecs" {
    interface Components {
        [heat]: { type: number };
        [tag]: { type: true };
        [flag]: { type: true };
        [filler]: { type: number };
    }
}

Component.register(heat, { type: { type: "number" } });
Component.register(tag, { type: { const: true } });
Component.register(flag, { type: { const: true } });
Component.register(filler, { type: { type: "number" } });

/** The entity the systems below act on, set by `create`. */
let target = Entity.none;
const create = System.create({ name: "observersTest/create" }, ({ commands }) => { target = commands.spawn({ [weight]: 1, [heat]: 0 }); });
const despawn = System.create({ name: "observersTest/despawn" }, ({ commands }) => { commands.despawn(target); });
const weigh = System.create({ name: "observersTest/weigh", components: { write: [weight], not: [filler] } }, row => {
    row[weight] += 1;
    row[weight] += 1;
});
const warm = System.create({ name: "observersTest/warm", components: { write: [heat] } }, row => { row[heat] += 1; });
const double = System.create({ name: "observersTest/double", kernel: "cpu", components: { write: [heat] } }, row => { row[heat] = row[heat] * 2 + 1; });
const addTag = System.create({ name: "observersTest/addTag" }, ({ commands }) => { commands.add(target, { [tag]: true }); });
const removeTag = System.create({ name: "observersTest/removeTag" }, ({ commands }) => { commands.remove(target, tag); });
const removeWeight = System.create({ name: "observersTest/removeWeight" }, ({ commands }) => { commands.remove(target, weight); });
const addFlag = System.create({ name: "observersTest/addFlag" }, ({ commands }) => { commands.add(target, { [flag]: true }); });
const fillers: Entity[] = [];
const crowd = System.create({ name: "observersTest/crowd" }, ({ commands }) => {
    for (let i = 0; i < 5000; i++) fillers.push(commands.spawn({ [filler]: i }));
});
/** Journals the target first, then more entities than the table holds, so the journal drops the target's entry. */
const scatter = System.create({ name: "observersTest/scatter" }, ({ commands }) => {
    commands.add(target, { [tag]: true });
    for (const spawned of fillers.splice(0)) commands.despawn(spawned);
});

describe("observing entities", () => {
    it("gives what read.entity returns when subscribing, then the value after each run that wrote a listed component, once", async () => {
        await using world = World.create();
        await world.run(create);
        const seen: unknown[] = [];
        world.observe.entity(target, { required: [weight], optional: [tag] })(value => seen.push(value));
        expect(seen).toEqual([{ [weight]: 1 }]);
        await world.run(weigh);
        expect(seen).toEqual([{ [weight]: 1 }, { [weight]: 3 }]);
        await world.run(warm);
        expect(seen).toEqual([{ [weight]: 1 }, { [weight]: 3 }]);
    });

    it("notifies when the entity gains or loses an optional component", async () => {
        await using world = World.create();
        await world.run(create);
        const seen: unknown[] = [];
        world.observe.entity(target, { optional: [flag] })(value => seen.push(value));
        await world.run(addFlag);
        await world.run(warm);
        expect(seen).toEqual([{}, { [flag]: true }]);
    });

    it("gives null when the entity loses a required component, and nothing while it stays null", async () => {
        await using world = World.create();
        await world.run(create);
        const seen: unknown[] = [];
        world.observe.entity(target, { required: [weight], optional: [heat, tag] })(value => seen.push(value));
        await world.run(addTag);
        await world.run(removeWeight);
        await world.run(warm);
        await world.run(removeTag);
        expect(seen).toEqual([{ [weight]: 1, [heat]: 0 }, { [weight]: 1, [heat]: 0, [tag]: true }, null]);
    });

    it("gives null once the entity is despawned, and nothing for another entity that reuses its index", async () => {
        await using world = World.create();
        await world.run(create);
        const despawned = target;
        const seen: unknown[] = [];
        world.observe.entity(despawned, { required: [heat] })(value => seen.push(value));
        await world.run(despawn);
        await world.run(create);
        expect(Number(target) % 2 ** 32).toBe(Number(despawned) % 2 ** 32);
        expect(target).not.toBe(despawned);
        await world.run(warm);
        expect(seen).toEqual([{ [heat]: 0 }, null]);
        const reused: unknown[] = [];
        world.observe.entity(target, { required: [heat] })(value => reused.push(value));
        await world.run(warm);
        expect(reused).toEqual([{ [heat]: 1 }, { [heat]: 2 }]);
        expect(seen).toEqual([{ [heat]: 0 }, null]);
    });

    it("without options, gives every component and notifies after writes to any of them and adds and removes", async () => {
        await using world = World.create();
        await world.run(create);
        const seen: unknown[] = [];
        world.observe.entity(target)(value => seen.push(value));
        await world.run(warm);
        await world.run(addTag);
        await world.run(weigh);
        await world.run(removeWeight);
        await world.run(despawn);
        await world.run(warm);
        expect(seen).toEqual([
            { [weight]: 1, [heat]: 0 },
            { [weight]: 1, [heat]: 1 },
            { [weight]: 1, [heat]: 1, [tag]: true },
            { [weight]: 3, [heat]: 1, [tag]: true },
            { [heat]: 1, [tag]: true },
            null,
        ]);
    });

    it("notifies after a kernel writes an observed component whose stamps it had dropped", async () => {
        await using world = World.create();
        await world.run(create);
        await world.run(double);
        const seen: unknown[] = [];
        world.observe.entity(target, { required: [heat] })(value => seen.push(value));
        await world.run(double);
        await world.run(weigh);
        await world.run(double);
        expect(seen).toEqual([{ [heat]: 1 }, { [heat]: 3 }, { [heat]: 7 }]);
    });

    it("compares every observed entity when the journal dropped entries", async () => {
        await using world = World.create();
        await world.run(create);
        const seen: unknown[] = [];
        world.observe.entity(target, { optional: [tag] })(value => seen.push(value));
        await world.run(crowd);
        await world.run(scatter);
        await world.run(weigh);
        expect(seen).toEqual([{}, { [tag]: true }]);
    });

    it("shares an entity's entry between observers, stopping one that another stops while a run notifies", async () => {
        await using world = World.create();
        await world.run(create);
        const seen: string[] = [];
        let stopSecond = (): void => {};
        world.observe.entity(target, { required: [weight] })(value => {
            seen.push(`first ${value?.[weight]}`);
            if (value !== null && value[weight] > 1) stopSecond();
        });
        stopSecond = world.observe.entity(target, { required: [weight] })(value => seen.push(`second ${value?.[weight]}`));
        expect((await world.run(weigh)).failures).toEqual([]);
        expect((await world.run(weigh)).failures).toEqual([]);
        stopSecond();
        expect(seen).toEqual(["first 1", "second 1", "first 3", "first 5"]);
    });

    it("gives an observer added while a run notifies only the value then", async () => {
        await using world = World.create();
        await world.run(create);
        const seen: unknown[] = [];
        world.observe.entity(target, { required: [weight] })(value => {
            if (value?.[weight] === 3) world.observe.entity(target, { required: [weight] })(later => seen.push(later));
        });
        await world.run(weigh);
        expect(seen).toEqual([{ [weight]: 3 }]);
    });

    it("throws to the subscriber when a first value throws, and reports an observer that throws while a run notifies", async () => {
        await using world = World.create();
        await world.run(create);
        expect(() => world.observe.entity(target)(() => { throw new Error("first failed"); })).toThrow("first failed");
        const seen: unknown[] = [];
        world.observe.entity(target, { required: [weight] })(value => {
            if (value !== null && value[weight] > 1) throw new Error("observer failed");
        });
        world.observe.entity(target, { required: [weight] })(value => seen.push(value));
        const { failures } = await world.run(weigh);
        expect(failures.map(({ kind, message }) => ({ kind, message }))).toEqual([{ kind: "observer", message: "observer failed" }]);
        expect(seen).toEqual([{ [weight]: 1 }, { [weight]: 3 }]);
    });
});

describe("entity observers' journal reading", () => {
    it("reads the journal while any entity is observed, and stops once the last observer stopped", () => {
        const state = createState();
        const observers = createObservers(state, () => undefined);
        const stopFirst = observers.entity(Entity.none, undefined)(() => {});
        const stopSecond = observers.entity(Entity.none, { required: [weight] })(() => {});
        expect(state.journal.readers).toBe(1);
        stopFirst();
        observers.deliver();
        expect(state.journal.readers).toBe(1);
        stopSecond();
        observers.deliver();
        expect(state.journal.readers).toBe(0);
        observers.entity(Entity.none, undefined)(() => {});
        expect(state.journal.readers).toBe(1);
    });
});
