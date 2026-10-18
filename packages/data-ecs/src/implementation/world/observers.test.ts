import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Resource } from "../../interface/resource/resource.js";
import { System } from "../../interface/system/system.js";
import { World } from "../../interface/world/world.js";
import { createObservers } from "./observers.js";
import { createState } from "./state.js";
import { createWorld } from "../index.js";

const level = Symbol("observersTest/level");
const other = Symbol("observersTest/other");
const total = Symbol("observersTest/total");
const weight = Symbol("observersTest/weight");

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
        await using world = createWorld();
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
        await using world = createWorld();
        const seen: number[] = [];
        world.observe.resource(total)(value => seen.push(value));
        await world.run(spawn);
        await world.run(sum);
        await world.run(sum);
        expect(seen).toEqual([0, 2]);
    });

    it("stops an observer that another stops while a run notifies", async () => {
        await using world = createWorld();
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
        await using world = createWorld();
        const seen: string[] = [];
        world.observe.resource(level)(value => {
            if (value === 2) world.observe.resource(level)(later => seen.push(`added ${later}`));
        });
        await world.run(raise, { by: 1 });
        expect(seen).toEqual(["added 2"]);
    });

    it("throws to the subscriber when a first value throws, and reports an observer that throws while a run notifies", async () => {
        await using world = createWorld();
        expect(() => world.observe.resource(level)(() => { throw new Error("first failed"); })).toThrow("first failed");
        const seen: number[] = [];
        world.observe.resource(level)(value => {
            if (value > 0) throw new Error("observer failed");
        });
        world.observe.resource(level)(value => seen.push(value));
        const { failures } = await world.run(raise, { by: 1 });
        expect(failures.map(({ kind, name, message }) => ({ kind, name, message }))).toEqual([{ kind: "observer", name: "src/implementation/world/observers.test.ts#level", message: "observer failed" }]);
        expect(seen).toEqual([0, 2]);
    });
});

const heat = Symbol("observersTest/heat");
const tag = Symbol("observersTest/tag");
const flag = Symbol("observersTest/flag");
const filler = Symbol("observersTest/filler");

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
describe("observing entities", () => {
    it("gives what read.entity returns when subscribing, then the value after each run that wrote a listed component, once", async () => {
        await using world = createWorld();
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
        await using world = createWorld();
        await world.run(create);
        const seen: unknown[] = [];
        world.observe.entity(target, { optional: [flag] })(value => seen.push(value));
        await world.run(addFlag);
        await world.run(warm);
        expect(seen).toEqual([{}, { [flag]: true }]);
    });

    it("gives null when the entity loses a required component, and nothing while it stays null", async () => {
        await using world = createWorld();
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
        await using world = createWorld();
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
        await using world = createWorld();
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
        await using world = createWorld();
        await world.run(create);
        await world.run(double);
        const seen: unknown[] = [];
        world.observe.entity(target, { required: [heat] })(value => seen.push(value));
        await world.run(double);
        await world.run(weigh);
        await world.run(double);
        expect(seen).toEqual([{ [heat]: 1 }, { [heat]: 3 }, { [heat]: 7 }]);
    });

    it("shares an entity's entry between observers, stopping one that another stops while a run notifies", async () => {
        await using world = createWorld();
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
        await using world = createWorld();
        await world.run(create);
        const seen: unknown[] = [];
        world.observe.entity(target, { required: [weight] })(value => {
            if (value?.[weight] === 3) world.observe.entity(target, { required: [weight] })(later => seen.push(later));
        });
        await world.run(weigh);
        expect(seen).toEqual([{ [weight]: 3 }]);
    });

    it("throws to the subscriber when a first value throws, and reports an observer that throws while a run notifies", async () => {
        await using world = createWorld();
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
    it("gives an observer subscribed during a run the writes later in that run", async () => {
        await using world = createWorld();
        await world.run(create);
        const seen: unknown[] = [];
        const subscribe = System.create({ name: "observersTest/subscribeEntity" }, () => {
            world.observe.entity(target, { required: [weight] })(value => seen.push(value));
        });
        const later = System.create({ name: "observersTest/laterWeigh", components: { write: [weight] }, after: [subscribe] }, row => { row[weight] += 2; });
        await world.run(System.composite({ name: "observersTest/subscribeThenWeigh", systems: [subscribe, later] }));
        await world.run(warm);
        expect(seen).toEqual([{ [weight]: 1 }, { [weight]: 3 }]);
    });
});

describe("entity observers' structural changes", () => {
    it("are found by locating each observed entity, so entity observers never make sync points journal", () => {
        const state = createState();
        const observers = createObservers(state, () => undefined, async task => task());
        observers.entity(Entity.none, undefined)(() => {});
        observers.entity(Entity.none, { required: [weight] })(() => {});
        expect(state.journal.readers).toBe(0);
    });
});

const score = Symbol("observersTest/score");
const benched = Symbol("observersTest/benched");
const marker = Symbol("observersTest/marker");

declare module "@adobe/data-ecs" {
    interface Components {
        [score]: { type: number };
        [benched]: { type: true };
        [marker]: { type: true };
    }
}

Component.register(score, { type: { type: "number" } });
Component.register(benched, { type: { const: true } });
Component.register(marker, { type: { const: true } });

/** Players the systems below act on, in spawn order, set by `players`. */
let roster: Entity[] = [];
const players = System.create({ name: "observersTest/players" }, ({ commands }) => {
    roster = [commands.spawn({ [score]: 1 }), commands.spawn({ [score]: 2 }), commands.spawn({ [score]: 3, [benched]: true })];
});
const join = System.create({ name: "observersTest/join" }, ({ commands }) => { roster.push(commands.spawn({ [score]: 0 })); });
const bench = System.create({ name: "observersTest/bench" }, ({ commands }) => { commands.add(roster[0], { [benched]: true }); });
/** The first player leaves the bench as the last joins it, so as many match as before. */
const swap = System.create({ name: "observersTest/swap" }, ({ commands }) => {
    commands.add(roster[0], { [benched]: true });
    commands.remove(roster[2], benched);
});
const mark = System.create({ name: "observersTest/mark" }, ({ commands }) => { commands.add(roster[0], { [marker]: true }); });
const leave = System.create({ name: "observersTest/leave" }, ({ commands }) => { commands.despawn(roster[1]); });
const score10 = System.create({ name: "observersTest/score10", components: { write: [score] } }, row => { row[score] += 10; });
const nudge = System.create({ name: "observersTest/nudge", components: { write: [score] } }, row => { row[score] += 0; });
const invert = System.create({ name: "observersTest/invert", components: { write: [score] } }, row => { row[score] = -row[score]; });
const invertKernel = System.create({ name: "observersTest/invertKernel", kernel: "cpu", components: { write: [score] } }, row => { row[score] = 0 - row[score]; });
/** Swaps the bench like `swap`, then despawns more entities than the journal holds, so it drops the swap's entries. */
const swapAndCrowd = System.create({ name: "observersTest/swapAndCrowd" }, ({ commands }) => {
    commands.add(roster[0], { [benched]: true });
    commands.remove(roster[2], benched);
    for (const spawned of crowded.splice(0)) commands.despawn(spawned);
});
const crowded: Entity[] = [];
const crowdUp = System.create({ name: "observersTest/crowdUp" }, ({ commands }) => {
    for (let i = 0; i < 5000; i++) crowded.push(commands.spawn({ [filler]: i }));
});

describe("observing queries", () => {
    it("gives the selection when subscribing, then after each run that changed which entities match", async () => {
        await using world = createWorld();
        await world.run(players);
        const seen: (readonly Entity[])[] = [];
        world.observe.select({ required: [score], not: [benched] })(entities => seen.push(entities));
        expect(seen).toEqual([[roster[0], roster[1]]]);
        await world.run(join);
        expect(seen).toEqual([[roster[0], roster[1]], [roster[0], roster[1], roster[3]]]);
        await world.run(bench);
        expect(seen.map(entities => new Set(entities))).toEqual([new Set([roster[0], roster[1]]), new Set([roster[0], roster[1], roster[3]]), new Set([roster[1], roster[3]])]);
    });

    it("notifies nothing when matching entities are written, or move archetype, but the same ones match", async () => {
        await using world = createWorld();
        await world.run(players);
        let notified = 0;
        world.observe.select({ required: [score], not: [benched] })(() => notified++);
        await world.run(score10);
        await world.run(mark);
        await world.run(players);
        expect(notified).toBe(2);
    });

    it("notifies when as many match as before but other entities", async () => {
        await using world = createWorld();
        await world.run(players);
        const seen: (readonly Entity[])[] = [];
        world.observe.select({ required: [score], not: [benched] })(entities => seen.push(entities));
        await world.run(swap);
        expect(seen.map(entities => new Set(entities))).toEqual([new Set([roster[0], roster[1]]), new Set([roster[1], roster[2]])]);
    });

    it("notifies after a despawn of a matching entity", async () => {
        await using world = createWorld();
        await world.run(players);
        const seen: number[] = [];
        world.observe.count({ required: [score] })(count => seen.push(count));
        await world.run(leave);
        await world.run(score10);
        expect(seen).toEqual([3, 2]);
    });

    it("recomputes when the journal dropped entries", async () => {
        await using world = createWorld();
        await world.run(players);
        await world.run(crowdUp);
        const seen: (readonly Entity[])[] = [];
        world.observe.select({ required: [score], not: [benched] })(entities => seen.push(entities));
        await world.run(swapAndCrowd);
        expect(seen.map(entities => new Set(entities))).toEqual([new Set([roster[0], roster[1]]), new Set([roster[1], roster[2]])]);
    });

    it("filters by where and notifies when a write changes which entities pass, not when it keeps them", async () => {
        await using world = createWorld();
        await world.run(players);
        const seen: (readonly Entity[])[] = [];
        world.observe.select({ required: [score], where: { [score]: { ">": 1 } } })(entities => seen.push(entities));
        await world.run(nudge);
        await world.run(invert);
        await world.run(invert);
        expect(seen.map(entities => new Set(entities))).toEqual([new Set([roster[1], roster[2]]), new Set(), new Set([roster[1], roster[2]])]);
    });

    it("notifies after a kernel writes a where component whose stamps it had dropped", async () => {
        await using world = createWorld();
        await world.run(players);
        await world.run(invertKernel);
        const seen: number[] = [];
        world.observe.count({ required: [score], where: { [score]: { ">": 0 } } })(count => seen.push(count));
        await world.run(invertKernel);
        await world.run(nudge);
        await world.run(invertKernel);
        expect(seen).toEqual([0, 3, 0]);
    });

    it("sorts by order and notifies when a write changes the order", async () => {
        await using world = createWorld();
        await world.run(players);
        const seen: (readonly Entity[])[] = [];
        world.observe.select({ required: [score], order: { [score]: false } })(entities => seen.push(entities));
        await world.run(score10);
        await world.run(invert);
        expect(seen).toEqual([[roster[2], roster[1], roster[0]], [roster[0], roster[1], roster[2]]]);
    });

    it("without required, matches every entity but the resource entity", async () => {
        await using world = createWorld({ [level]: 1 });
        await world.run(raise, { by: 1 });
        await world.run(players);
        const seen: number[] = [];
        world.observe.count({})(count => seen.push(count));
        const selected: (readonly Entity[])[] = [];
        world.observe.select({ not: [benched] })(entities => selected.push(entities));
        expect(seen).toEqual([3]);
        expect(selected).toEqual([[roster[0], roster[1]]]);
    });

    it("counts, notifying only when the number changes", async () => {
        await using world = createWorld();
        await world.run(players);
        const seen: number[] = [];
        world.observe.count({ required: [score], not: [benched] })(count => seen.push(count));
        await world.run(swap);
        await world.run(join);
        expect(seen).toEqual([2, 3]);
    });

    it("gives an observer subscribed during a run the writes later in that run", async () => {
        await using world = createWorld();
        await world.run(players);
        const seen: number[] = [];
        const subscribe = System.create({ name: "observersTest/subscribe" }, () => {
            world.observe.count({ required: [score], where: { [score]: { "<": 0 } } })(count => seen.push(count));
        });
        const later = System.create({ name: "observersTest/later", components: { write: [score] }, after: [subscribe] }, row => { row[score] = -row[score]; });
        await world.run(System.composite({ name: "observersTest/subscribeThenWrite", systems: [subscribe, later] }));
        expect(seen).toEqual([0, 3]);
    });

    it("throws to the subscriber when a first value throws, reports one that throws during a run by its required components, and stops", async () => {
        await using world = createWorld();
        await world.run(players);
        expect(() => world.observe.count({ required: [score] })(() => { throw new Error("first failed"); })).toThrow("first failed");
        world.observe.count({ required: [score, benched] })(count => {
            if (count > 1) throw new Error("observer failed");
        });
        const seen: number[] = [];
        const stop = world.observe.count({ required: [score, benched] })(count => seen.push(count));
        const { failures } = await world.run(bench);
        expect(failures.map(({ kind, name, message }) => ({ kind, name, message }))).toEqual([{ kind: "observer", name: `src/implementation/world/observers.test.ts#score, src/implementation/world/observers.test.ts#benched`, message: "observer failed" }]);
        stop();
        await world.run(join);
        await world.run(leave);
        expect(seen).toEqual([1, 2]);
    });
});

const rank = Symbol("observersTest/rank");
const second = Symbol("observersTest/second");

declare module "@adobe/data-ecs" {
    interface Components {
        [rank]: { type: number };
        [second]: { type: number };
    }
}

Component.register(rank, { type: { type: "number" } });
Component.register(second, { type: { type: "number" } });

/** What `rankAll` spawns: each entity's rank, second key, and whether it's marked, which puts it in another archetype. */
let ranks: readonly (readonly [number, number, boolean])[] = [];
/** The entities `rankAll` spawned, in order. */
let ranked: Entity[] = [];
const rankAll = System.create({ name: "observersTest/rankAll" }, ({ commands }) => {
    ranked = ranks.map(([value, key, marked]) => commands.spawn(marked ? { [rank]: value, [second]: key, [marker]: true } : { [rank]: value, [second]: key }));
});
/** What `rerank` sets: an index into `ranked` and its new rank. */
let reranks: readonly (readonly [number, number])[] = [];
const rerank = System.create({ name: "observersTest/rerank" }, ({ commands }) => {
    for (const [index, value] of reranks) commands.add(ranked[index], { [rank]: value });
});

/** A deterministic generator of numbers in [0, 1). */
const random = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe("observing a page of a query", () => {
    it("gives the slice at offset of the ordered result, at most limit long", async () => {
        await using world = createWorld();
        ranks = [5, 3, 9, 0, 7, 1, 8, 2, 6, 4].map(value => [value, 0, false]);
        await world.run(rankAll);
        const byRank = [3, 5, 7, 1, 9, 0, 8, 4, 6, 2].map(index => ranked[index]);
        const page = (offset: number, limit: number): readonly Entity[] => {
            let value: readonly Entity[] = [];
            world.observe.select({ required: [rank], order: { [rank]: true }, page: { offset, limit } })(entities => { value = entities; })();
            return value;
        };
        expect(page(0, 3)).toEqual(byRank.slice(0, 3));
        expect(page(3, 3)).toEqual(byRank.slice(3, 6));
        expect(page(9, 3)).toEqual(byRank.slice(9));
        expect(page(12, 3)).toEqual([]);
        expect(page(2, 0)).toEqual([]);
    });

    it("without order, gives the slice of storage order, with where applied first", async () => {
        await using world = createWorld();
        ranks = [5, 3, 9, 0, 7, 1, 8, 2, 6, 4].map((value, index) => [value, 0, index % 3 === 0]);
        await world.run(rankAll);
        let all: readonly Entity[] = [];
        world.observe.select({ required: [rank], where: { [rank]: { ">": 1 } } })(entities => { all = entities; })();
        let paged: readonly Entity[] = [];
        world.observe.select({ required: [rank], where: { [rank]: { ">": 1 } }, page: { offset: 2, limit: 4 } })(entities => { paged = entities; })();
        expect(all).toHaveLength(8);
        expect(paged).toEqual(all.slice(2, 6));
        world.observe.select({ required: [rank] })(entities => { all = entities; })();
        world.observe.select({ required: [rank], page: { offset: 7, limit: 2 } })(entities => { paged = entities; })();
        expect(paged).toEqual(all.slice(7, 9));
    });

    it("notifies when a change shifts the page, not for one outside it", async () => {
        await using world = createWorld();
        ranks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(value => [value, 0, false]);
        await world.run(rankAll);
        const seen: (readonly Entity[])[] = [];
        world.observe.select({ required: [rank], order: { [rank]: true }, page: { offset: 1, limit: 3 } })(entities => seen.push(entities));
        reranks = [[8, 7.5], [9, 20]];
        await world.run(rerank);
        reranks = [[0, 2.5]];
        await world.run(rerank);
        reranks = [[7, 1.5]];
        await world.run(rerank);
        reranks = [[5, -1]];
        await world.run(rerank);
        expect(seen).toEqual([
            [ranked[1], ranked[2], ranked[3]],
            [ranked[2], ranked[0], ranked[3]],
            [ranked[7], ranked[2], ranked[0]],
            [ranked[1], ranked[7], ranked[2]],
        ]);
    });

    it("selects the same entities as sorting everything and slicing, ties included", async () => {
        await using world = createWorld();
        const next = random(7);
        ranks = Array.from({ length: 300 }, () => [Math.floor(next() * 6), Math.floor(next() * 3), next() < 0.4]);
        await world.run(rankAll);
        const order = { [rank]: true, [second]: false };
        let full: readonly Entity[] = [];
        world.observe.select({ required: [rank, second], order })(entities => { full = entities; });
        const pages = [[0, 10], [0, 1], [7, 25], [123, 60], [290, 40], [0, 300], [0, 1000], [350, 5], [40, 0]];
        const latest = pages.map(() => [] as readonly Entity[]);
        pages.forEach(([offset, limit], index) => {
            world.observe.select({ required: [rank, second], order, page: { offset, limit } })(entities => { latest[index] = entities; });
        });
        const check = (): void => pages.forEach(([offset, limit], index) => expect(latest[index]).toEqual(full.slice(offset, offset + limit)));
        check();
        for (let round = 0; round < 5; round++) {
            reranks = Array.from({ length: 40 }, () => [Math.floor(next() * ranked.length), Math.floor(next() * 6)]);
            await world.run(rerank);
            check();
        }
        const descending = { [rank]: false };
        world.observe.select({ required: [rank], order: descending })(entities => { full = entities; })();
        world.observe.select({ required: [rank], order: descending, page: { offset: 13, limit: 77 } })(entities => expect(entities).toEqual(full.slice(13, 90)))();
    });

    it("leaves count the total", async () => {
        await using world = createWorld();
        ranks = [0, 1, 2, 3, 4].map(value => [value, 0, false]);
        await world.run(rankAll);
        // Not a literal, so its page passes the type: count ignores it.
        const paged = { required: [rank], page: { offset: 1, limit: 2 } } as const;
        const seen: number[] = [];
        world.observe.count(paged)(count => seen.push(count));
        expect(seen).toEqual([5]);
    });

    it("throws when subscribing with an offset or limit that isn't a non-negative integer", async () => {
        await using world = createWorld();
        for (const page of [{ offset: -1, limit: 1 }, { offset: 1.5, limit: 1 }, { offset: 0, limit: -1 }, { offset: 0, limit: Number.NaN }]) {
            expect(() => world.observe.select({ required: [rank], page })(() => {})).toThrow("page");
        }
    });
});

describe("query observers' journal reading", () => {
    it("reads the journal while any query is observed, and stops once the last observer stopped", () => {
        const state = createState();
        const observers = createObservers(state, () => undefined, async task => task());
        const stopFirst = observers.query({ required: [weight] }, false)(() => {});
        const stopSecond = observers.query({}, true)(() => {});
        expect(state.journal.readers).toBe(1);
        stopFirst();
        expect(state.journal.readers).toBe(1);
        stopSecond();
        expect(state.journal.readers).toBe(0);
        observers.query({}, false)(() => {});
        expect(state.journal.readers).toBe(1);
    });
});
