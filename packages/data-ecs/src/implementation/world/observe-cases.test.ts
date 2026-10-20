import { afterEach, describe, expect, it, vi } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Resource } from "../../interface/resource/resource.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "../index.js";
import { adapters, byDesign, settle, type Adapter } from "./observe-adapters.test-helper.js";

// The cases of `observers.test.ts`, run for the world's own observers and for the factories alike. Each subscribes,
// settles, then expects, so it holds whenever a first value comes; one that expects otherwise for the factories says
// why through `byDesign`.

const level = Symbol("observeCasesTest/level");
const other = Symbol("observeCasesTest/other");
const total = Symbol("observeCasesTest/total");
const weight = Symbol("observeCasesTest/weight");

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

const raise = System.create({ name: "observeCasesTest/raise", input: { type: "object", properties: { by: { type: "number" } } }, resources: { write: [level] } }, ({ input, resources }) => {
    resources[level] += input.by;
    resources[level] += input.by;
});
const touchOther = System.create({ name: "observeCasesTest/touchOther", resources: { write: [other] } }, ({ resources }) => { resources[other] += 1; });
const spawn = System.create({ name: "observeCasesTest/spawn" }, ({ commands }) => { commands.spawn([weight])({ [weight]: 2 }); });
const sum = System.create({ name: "observeCasesTest/sum", components: { read: [weight] }, reduce: { [total]: "+" } }, (row, { reduce }) => { reduce[total](row[weight]); });
const keep = System.create({ name: "observeCasesTest/keep", resources: { write: [level] } }, ({ resources }) => { resources[level] = resources[level] + 0; });

/** Errors thrown out of band while `catching` runs, as uncaught errors would be, caught instead. */
const catching = async (run: () => Promise<void>): Promise<unknown[]> => {
    const caught: unknown[] = [];
    const original = globalThis.queueMicrotask;
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation(callback => original(() => {
        try {
            callback();
        }
        catch (error) {
            caught.push(error);
        }
    }));
    try {
        await run();
    }
    finally {
        vi.restoreAllMocks();
    }
    return caught;
};

afterEach(() => { vi.restoreAllMocks(); });

const heat = Symbol("observeCasesTest/heat");
const tag = Symbol("observeCasesTest/tag");
const flag = Symbol("observeCasesTest/flag");
const filler = Symbol("observeCasesTest/filler");

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
const create = System.create({ name: "observeCasesTest/create" }, ({ commands }) => { target = commands.spawn([weight, heat])({ [weight]: 1, [heat]: 0 }); });
const despawn = System.create({ name: "observeCasesTest/despawn" }, ({ commands }) => { commands.despawn(target); });
const weigh = System.create({ name: "observeCasesTest/weigh", components: { write: [weight], not: [filler] } }, row => {
    row[weight] += 1;
    row[weight] += 1;
});
const warm = System.create({ name: "observeCasesTest/warm", components: { write: [heat] } }, row => { row[heat] += 1; });
const double = System.create({ name: "observeCasesTest/double", kernel: "cpu", components: { write: [heat] } }, row => { row[heat] = row[heat] * 2 + 1; });
const addTag = System.create({ name: "observeCasesTest/addTag" }, ({ commands }) => { commands.add(target, tag, true); });
const removeTag = System.create({ name: "observeCasesTest/removeTag" }, ({ commands }) => { commands.remove(target, tag); });
const removeWeight = System.create({ name: "observeCasesTest/removeWeight" }, ({ commands }) => { commands.remove(target, weight); });
const addFlag = System.create({ name: "observeCasesTest/addFlag" }, ({ commands }) => { commands.add(target, flag, true); });

const score = Symbol("observeCasesTest/score");
const benched = Symbol("observeCasesTest/benched");
const marker = Symbol("observeCasesTest/marker");

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
const players = System.create({ name: "observeCasesTest/players" }, ({ commands }) => {
    roster = [commands.spawn([score])({ [score]: 1 }), commands.spawn([score])({ [score]: 2 }), commands.spawn([score, benched])({ [score]: 3, [benched]: true })];
});
const join = System.create({ name: "observeCasesTest/join" }, ({ commands }) => { roster.push(commands.spawn([score])({ [score]: 0 })); });
const bench = System.create({ name: "observeCasesTest/bench" }, ({ commands }) => { commands.add(roster[0], benched, true); });
/** The first player leaves the bench as the last joins it, so as many match as before. */
const swap = System.create({ name: "observeCasesTest/swap" }, ({ commands }) => {
    commands.add(roster[0], benched, true);
    commands.remove(roster[2], benched);
});
const mark = System.create({ name: "observeCasesTest/mark" }, ({ commands }) => { commands.add(roster[0], marker, true); });
const leave = System.create({ name: "observeCasesTest/leave" }, ({ commands }) => { commands.despawn(roster[1]); });
const score10 = System.create({ name: "observeCasesTest/score10", components: { write: [score] } }, row => { row[score] += 10; });
const nudge = System.create({ name: "observeCasesTest/nudge", components: { write: [score] } }, row => { row[score] += 0; });
const invert = System.create({ name: "observeCasesTest/invert", components: { write: [score] } }, row => { row[score] = -row[score]; });
const invertKernel = System.create({ name: "observeCasesTest/invertKernel", kernel: "cpu", components: { write: [score] } }, row => { row[score] = 0 - row[score]; });
/** Swaps the bench like `swap`, then despawns more entities than the journal holds, so it drops the swap's entries. */
const swapAndCrowd = System.create({ name: "observeCasesTest/swapAndCrowd" }, ({ commands }) => {
    commands.add(roster[0], benched, true);
    commands.remove(roster[2], benched);
    for (const spawned of crowded.splice(0)) commands.despawn(spawned);
});
const crowded: Entity[] = [];
const crowdUp = System.create({ name: "observeCasesTest/crowdUp" }, ({ commands }) => {
    for (let i = 0; i < 5000; i++) crowded.push(commands.spawn([filler])({ [filler]: i }));
});

const rank = Symbol("observeCasesTest/rank");
const second = Symbol("observeCasesTest/second");

declare module "@adobe/data-ecs" {
    interface Components {
        [rank]: { type: number };
        [second]: { type: number };
    }
}

Component.register(rank, { type: { type: "number" } });
Component.register(second, { type: { type: "number" } });

const coarse = Symbol("observeCasesTest/coarse");
declare module "@adobe/data-ecs" {
    interface Components {
        [coarse]: { type: number };
    }
}
// Kept at 32 bits, so a 64-bit bound may fall between two values it keeps.
Component.register(coarse, { type: { type: "number", precision: 1 } });
let coarseValues: readonly number[] = [];
const spawnCoarse = System.create({ name: "observeCasesTest/spawnCoarse" }, ({ commands }) => {
    for (const each of coarseValues) commands.spawn([coarse])({ [coarse]: each });
});
const shiftCoarse = System.create({ name: "observeCasesTest/shiftCoarse", components: { write: [coarse] } }, row => { row[coarse] = row[coarse] + 0.1; });

type Condition = number | { readonly "<"?: number; readonly ">"?: number; readonly "<="?: number; readonly ">="?: number; readonly "=="?: number; readonly "!="?: number };

/** Whether a value passes a condition, as `where` tests it. */
const passesCondition = (value: number, condition: Condition): boolean => typeof condition === "number" ? value === condition : Object.entries(condition).every(([operator, operand]) =>
    operator === "<" ? value < operand : operator === ">" ? value > operand : operator === "<=" ? value <= operand : operator === ">=" ? value >= operand : operator === "==" ? value === operand : value !== operand);

/** What `rankAll` spawns: each entity's rank, second key, and whether it's marked, which puts it in another archetype. */
let ranks: readonly (readonly [number, number, boolean])[] = [];
/** The entities `rankAll` spawned, in order. */
let ranked: Entity[] = [];
const rankAll = System.create({ name: "observeCasesTest/rankAll" }, ({ commands }) => {
    ranked = ranks.map(([value, key, marked]) => commands.spawn(marked ? [rank, second, marker] : [rank, second])({ [rank]: value, [second]: key }));
});
/** What `rerank` sets: an index into `ranked` and its new rank. */
let reranks: readonly (readonly [number, number])[] = [];
const rerank = System.create({ name: "observeCasesTest/rerank" }, ({ commands }) => {
    for (const [index, value] of reranks) commands.add(ranked[index], rank, value);
});

/** A deterministic generator of numbers in [0, 1). */
const random = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const byIndex = (a: Entity, b: Entity): number => (a % 2 ** 32) - (b % 2 ** 32);

const cases = (adapter: Adapter): void => {
    const { resource, entity, select, count, toPromise } = adapter;

    describe("observing resources", () => {
        it("gives the current value, then the value after each run that changed it", async () => {
            await using world = createWorld();
            const seen: number[] = [];
            resource(world, level)(value => seen.push(value));
            await settle(world);
            expect(seen).toEqual([0]);
            await world.run(raise, { by: 1 });
            expect(seen).toEqual([0, 2]);
            await world.run(touchOther);
            expect(seen).toEqual([0, 2]);
            await world.run(raise, { by: 3 });
            expect(seen).toEqual([0, 2, 8]);
            // A write of the same value stamps it.
            await world.run(keep);
            expect(seen).toEqual([0, 2, 8, 8]);
        });

        it("notifies a reduced resource only when its fold differs", async () => {
            await using world = createWorld();
            const seen: number[] = [];
            resource(world, total)(value => seen.push(value));
            await world.run(spawn);
            await world.run(sum);
            await world.run(sum);
            expect(seen).toEqual([0, 2]);
        });

        it("stops an observer that another stops while a run notifies", async () => {
            await using world = createWorld();
            const seen: string[] = [];
            let stopSecond = (): void => {};
            resource(world, level)(value => {
                seen.push(`first ${value}`);
                if (value > 0) stopSecond();
            });
            stopSecond = resource(world, level)(value => seen.push(`second ${value}`));
            await settle(world);
            await world.run(raise, { by: 1 });
            await world.run(raise, { by: 1 });
            stopSecond();
            expect(seen).toEqual(["first 0", "second 0", "first 2", "first 4"]);
        });

        it("gives an observer added while a run notifies only the value then", async () => {
            await using world = createWorld();
            const seen: string[] = [];
            resource(world, level)(value => {
                if (value === 2) resource(world, level)(later => seen.push(`added ${later}`));
            });
            await settle(world);
            await world.run(raise, { by: 1 });
            await settle(world);
            expect(seen).toEqual(["added 2"]);
        });

        it("throws to the subscriber when a first value given while subscribing throws", async () => {
            await using world = createWorld();
            // The factories give a first value while subscribing once they hold the resource's.
            const stop = resource(world, level)(() => {});
            await settle(world);
            expect(() => resource(world, level)(() => { throw new Error("first failed"); })).toThrow("first failed");
            const seen: number[] = [];
            resource(world, level)(value => seen.push(value));
            await world.run(raise, { by: 1 });
            expect(seen).toEqual([0, 2]);
            stop();
        });

        it("reports an observer that throws while a run notifies, and notifies the others", async () => {
            await using world = createWorld();
            const seen: number[] = [];
            resource(world, level)(value => {
                if (value > 0) throw new Error("observer failed");
            });
            resource(world, level)(value => seen.push(value));
            await settle(world);
            const { failures } = await world.run(raise, { by: 1 });
            expect(failures.map(({ kind, name, message }) => ({ kind, name, message }))).toEqual([byDesign(adapter, "system failures")
                ? { kind: "system", name: expect.stringMatching(/^Observe\.resource\(observeCasesTest\/level\)/), message: "observer failed" }
                : { kind: "observer", name: "observeCasesTest/level", message: "observer failed" }]);
            expect(seen).toEqual([0, 2]);
        });

        it("give a world disposed after subscribing its first value while subscribing, or none", async () => {
            const world = createWorld();
            const seen: number[] = [];
            resource(world, level)(value => seen.push(value));
            await world.dispose();
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(seen).toEqual(byDesign(adapter, "disposed") ? [] : [0]);
        });

        it("on a first value that throws when the factories don't hold it, stops that observer and throws it out of band", async () => {
            await using world = createWorld();
            let calls = 0;
            const failing = (): void => {
                calls++;
                throw new Error("first failed");
            };
            if (byDesign(adapter, "cold first throw")) {
                const caught = await catching(async () => {
                    resource(world, level)(failing);
                    await settle(world);
                });
                expect(caught.map(error => error instanceof Error ? error.message : error)).toEqual(["first failed"]);
            }
            // The world's own observers give it while subscribing, which throws to the subscriber.
            else expect(() => resource(world, level)(failing)).toThrow("first failed");
            expect((await world.run(raise, { by: 1 })).failures).toEqual([]);
            expect(calls).toBe(1);
        });
    });

    describe("observing entities", () => {
        it("gives the listed components, then the value after each run that wrote a listed component, once", async () => {
            await using world = createWorld();
            await world.run(create);
            const seen: unknown[] = [];
            entity(world, target, { required: [weight], optional: [tag] })(value => seen.push(value));
            await settle(world);
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
            entity(world, target, { optional: [flag] })(value => seen.push(value));
            await settle(world);
            await world.run(addFlag);
            await world.run(warm);
            expect(seen).toEqual([{}, { [flag]: true }]);
        });

        it("gives null when the entity loses a required component, and nothing while it stays null", async () => {
            await using world = createWorld();
            await world.run(create);
            const seen: unknown[] = [];
            entity(world, target, { required: [weight], optional: [heat, tag] })(value => seen.push(value));
            await settle(world);
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
            entity(world, despawned, { required: [heat] })(value => seen.push(value));
            await settle(world);
            await world.run(despawn);
            await world.run(create);
            expect(Number(target) % 2 ** 32).toBe(Number(despawned) % 2 ** 32);
            expect(target).not.toBe(despawned);
            await world.run(warm);
            expect(seen).toEqual([{ [heat]: 0 }, null]);
            const reused: unknown[] = [];
            entity(world, target, { required: [heat] })(value => reused.push(value));
            await settle(world);
            await world.run(warm);
            expect(reused).toEqual([{ [heat]: 1 }, { [heat]: 2 }]);
            expect(seen).toEqual([{ [heat]: 0 }, null]);
        });

        it("listing every component, notifies after writes to any of them and adds and removes", async () => {
            await using world = createWorld();
            await world.run(create);
            const seen: unknown[] = [];
            if (byDesign(adapter, "whole entity")) entity(world, target, { optional: [weight, heat, tag] })(value => seen.push(value));
            else world.observe.entity(target)(value => seen.push(value));
            await settle(world);
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
            await using world = createWorld({ [workers]: 0 });
            await world.run(create);
            await world.run(double);
            const seen: unknown[] = [];
            entity(world, target, { required: [heat] })(value => seen.push(value));
            await settle(world);
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
            entity(world, target, { required: [weight] })(value => {
                seen.push(`first ${value?.[weight]}`);
                if (value !== null && value[weight] > 1) stopSecond();
            });
            stopSecond = entity(world, target, { required: [weight] })(value => seen.push(`second ${value?.[weight]}`));
            await settle(world);
            expect((await world.run(weigh)).failures).toEqual([]);
            expect((await world.run(weigh)).failures).toEqual([]);
            stopSecond();
            expect(seen).toEqual(["first 1", "second 1", "first 3", "first 5"]);
        });

        it("gives an observer added while a run notifies only the value then", async () => {
            await using world = createWorld();
            await world.run(create);
            const seen: unknown[] = [];
            entity(world, target, { required: [weight] })(value => {
                if (value?.[weight] === 3) entity(world, target, { required: [weight] })(later => seen.push(later));
            });
            await settle(world);
            await world.run(weigh);
            await settle(world);
            expect(seen).toEqual([{ [weight]: 3 }]);
        });

        it("reports an observer that throws while a run notifies, and notifies the others", async () => {
            await using world = createWorld();
            await world.run(create);
            const seen: unknown[] = [];
            entity(world, target, { required: [weight] })(value => {
                if (value !== null && value[weight] > 1) throw new Error("observer failed");
            });
            entity(world, target, { required: [weight] })(value => seen.push(value));
            await settle(world);
            const { failures } = await world.run(weigh);
            expect(failures.map(({ kind, message }) => ({ kind, message }))).toEqual([{ kind: byDesign(adapter, "system failures") ? "system" : "observer", message: "observer failed" }]);
            expect(seen).toEqual([{ [weight]: 1 }, { [weight]: 3 }]);
        });

        it("gives an observer subscribed during a run the state then, or after the run", async () => {
            await using world = createWorld();
            await world.run(create);
            const seen: unknown[] = [];
            const subscribe = System.create({ name: "observeCasesTest/subscribeEntity" }, () => {
                entity(world, target, { required: [weight] })(value => seen.push(value));
            });
            const later = System.create({ name: "observeCasesTest/laterWeigh", components: { write: [weight] }, after: [subscribe] }, row => { row[weight] += 2; });
            await world.run(System.create({ name: "observeCasesTest/subscribeThenWeigh", systems: [subscribe, later] }));
            await settle(world);
            await world.run(warm);
            expect(seen).toEqual(byDesign(adapter, "cold first value") ? [{ [weight]: 3 }] : [{ [weight]: 1 }, { [weight]: 3 }]);
        });
    });

    describe("observing queries", () => {
        it("gives the selection, then after each run that changed which entities match", async () => {
            await using world = createWorld();
            await world.run(players);
            const seen: (readonly Entity[])[] = [];
            select(world, { required: [score], not: [benched] })(entities => seen.push(entities));
            await settle(world);
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
            select(world, { required: [score], not: [benched] })(() => notified++);
            await settle(world);
            await world.run(score10);
            await world.run(mark);
            await world.run(players);
            expect(notified).toBe(2);
        });

        it("notifies when as many match as before but other entities", async () => {
            await using world = createWorld();
            await world.run(players);
            const seen: (readonly Entity[])[] = [];
            select(world, { required: [score], not: [benched] })(entities => seen.push(entities));
            await settle(world);
            await world.run(swap);
            expect(seen.map(entities => new Set(entities))).toEqual([new Set([roster[0], roster[1]]), new Set([roster[1], roster[2]])]);
        });

        it("notifies after a despawn of a matching entity", async () => {
            await using world = createWorld();
            await world.run(players);
            const seen: number[] = [];
            count(world, { required: [score] })(value => seen.push(value));
            await settle(world);
            await world.run(leave);
            await world.run(score10);
            expect(seen).toEqual([3, 2]);
        });

        it("recomputes when the journal dropped entries", async () => {
            await using world = createWorld();
            await world.run(players);
            await world.run(crowdUp);
            const seen: (readonly Entity[])[] = [];
            select(world, { required: [score], not: [benched] })(entities => seen.push(entities));
            await settle(world);
            await world.run(swapAndCrowd);
            expect(seen.map(entities => new Set(entities))).toEqual([new Set([roster[0], roster[1]]), new Set([roster[1], roster[2]])]);
        });

        it("filters by where and notifies when a write changes which entities pass, not when it keeps them", async () => {
            await using world = createWorld();
            await world.run(players);
            const seen: (readonly Entity[])[] = [];
            select(world, { required: [score], where: { [score]: { ">": 1 } } })(entities => seen.push(entities));
            await settle(world);
            await world.run(nudge);
            await world.run(invert);
            await world.run(invert);
            expect(seen.map(entities => new Set(entities))).toEqual([new Set([roster[1], roster[2]]), new Set(), new Set([roster[1], roster[2]])]);
        });

        it("notifies after a kernel writes a where component whose stamps it had dropped", async () => {
            await using world = createWorld({ [workers]: 0 });
            await world.run(players);
            await world.run(invertKernel);
            const seen: number[] = [];
            count(world, { required: [score], where: { [score]: { ">": 0 } } })(value => seen.push(value));
            await settle(world);
            await world.run(invertKernel);
            await world.run(nudge);
            await world.run(invertKernel);
            expect(seen).toEqual([0, 3, 0]);
        });

        it("sorts by order and notifies when a write changes the order", async () => {
            await using world = createWorld();
            await world.run(players);
            const seen: (readonly Entity[])[] = [];
            select(world, { required: [score], order: { [score]: false } })(entities => seen.push(entities));
            await settle(world);
            await world.run(score10);
            await world.run(invert);
            expect(seen).toEqual([[roster[2], roster[1], roster[0]], [roster[0], roster[1], roster[2]]]);
        });

        it("without required, matches every entity but the resource entity", async () => {
            await using world = createWorld({ [level]: 1 });
            await world.run(raise, { by: 1 });
            await world.run(players);
            const seen: number[] = [];
            count(world, {})(value => seen.push(value));
            const selected: (readonly Entity[])[] = [];
            select(world, { not: [benched] })(entities => selected.push(entities));
            await settle(world);
            expect(seen).toEqual([3]);
            expect(selected).toEqual([[roster[0], roster[1]]]);
        });

        it("counts, notifying only when the number changes", async () => {
            await using world = createWorld();
            await world.run(players);
            const seen: number[] = [];
            count(world, { required: [score], not: [benched] })(value => seen.push(value));
            await settle(world);
            await world.run(swap);
            await world.run(join);
            expect(seen).toEqual([2, 3]);
        });

        it("gives an observer subscribed during a run the state then, or after the run", async () => {
            await using world = createWorld();
            await world.run(players);
            const seen: number[] = [];
            const subscribe = System.create({ name: "observeCasesTest/subscribe" }, () => {
                count(world, { required: [score], where: { [score]: { "<": 0 } } })(value => seen.push(value));
            });
            const later = System.create({ name: "observeCasesTest/later", components: { write: [score] }, after: [subscribe] }, row => { row[score] = -row[score]; });
            await world.run(System.create({ name: "observeCasesTest/subscribeThenWrite", systems: [subscribe, later] }));
            await settle(world);
            expect(seen).toEqual(byDesign(adapter, "cold first value") ? [3] : [0, 3]);
        });

        it("reports one that throws during a run, and stops one stopped", async () => {
            await using world = createWorld();
            await world.run(players);
            count(world, { required: [score, benched] })(value => {
                if (value > 1) throw new Error("observer failed");
            });
            const seen: number[] = [];
            const stop = count(world, { required: [score, benched] })(value => seen.push(value));
            await settle(world);
            const { failures } = await world.run(bench);
            expect(failures.map(({ kind, name, message }) => ({ kind, name, message }))).toEqual([byDesign(adapter, "system failures")
                ? { kind: "system", name: expect.stringMatching(/^Observe\.count\(observeCasesTest\/score, observeCasesTest\/benched\)/), message: "observer failed" }
                : { kind: "observer", name: "observeCasesTest/score, observeCasesTest/benched", message: "observer failed" }]);
            stop();
            await world.run(join);
            await world.run(leave);
            expect(seen).toEqual([1, 2]);
        });

        it("in entity order, or storage order, without order", async () => {
            await using world = createWorld();
            ranks = [5, 3, 9, 0, 7, 1].map((value, index) => [value, 0, index % 2 === 0]);
            await world.run(rankAll);
            const all = await toPromise(select(world, { required: [rank] }));
            if (byDesign(adapter, "entity order")) expect(all).toEqual([...ranked].sort(byIndex));
            // The marked entities' archetype came first.
            else expect(all).toEqual([...ranked.filter((_, index) => index % 2 === 0), ...ranked.filter((_, index) => index % 2 === 1)]);
        });

        it("breaks ties under order in entity order, or storage order", async () => {
            await using world = createWorld();
            ranks = [1, 1, 0, 0, 1, 1].map((value, index) => [value, 0, index % 2 === 0]);
            await world.run(rankAll);
            // The marked entities' archetype came first.
            const storage = [...ranked.filter((_, index) => index % 2 === 0), ...ranked.filter((_, index) => index % 2 === 1)];
            const listed = byDesign(adapter, "entity order") ? ranked : storage;
            const zeros = listed.filter(entity => ranks[ranked.indexOf(entity)][0] === 0);
            const ones = listed.filter(entity => ranks[ranked.indexOf(entity)][0] === 1);
            for (const ascending of [true, false]) {
                const sorted = await toPromise(select(world, { required: [rank], order: { [rank]: ascending } }));
                expect(sorted).toEqual(ascending ? [...zeros, ...ones] : [...ones, ...zeros]);
                const paged = await toPromise(select(world, { required: [rank], order: { [rank]: ascending }, page: { offset: 1, limit: 3 } }));
                expect(paged).toEqual(sorted.slice(1, 4));
            }
        });
    });

    describe("observing a page of a query", () => {
        it("gives the slice at offset of the ordered result, at most limit long", async () => {
            await using world = createWorld();
            ranks = [5, 3, 9, 0, 7, 1, 8, 2, 6, 4].map(value => [value, 0, false]);
            await world.run(rankAll);
            const byRank = [3, 5, 7, 1, 9, 0, 8, 4, 6, 2].map(index => ranked[index]);
            const page = (offset: number, limit: number): Promise<readonly Entity[]> => toPromise(select(world, { required: [rank], order: { [rank]: true }, page: { offset, limit } }));
            expect(await page(0, 3)).toEqual(byRank.slice(0, 3));
            expect(await page(3, 3)).toEqual(byRank.slice(3, 6));
            expect(await page(9, 3)).toEqual(byRank.slice(9));
            expect(await page(12, 3)).toEqual([]);
            expect(await page(2, 0)).toEqual([]);
        });

        it("without order, gives the slice of its order without a page, with where applied first", async () => {
            await using world = createWorld();
            ranks = [5, 3, 9, 0, 7, 1, 8, 2, 6, 4].map((value, index) => [value, 0, index % 3 === 0]);
            await world.run(rankAll);
            let all = await toPromise(select(world, { required: [rank], where: { [rank]: { ">": 1 } } }));
            let paged = await toPromise(select(world, { required: [rank], where: { [rank]: { ">": 1 } }, page: { offset: 2, limit: 4 } }));
            expect(all).toHaveLength(8);
            expect(paged).toEqual(all.slice(2, 6));
            all = await toPromise(select(world, { required: [rank] }));
            paged = await toPromise(select(world, { required: [rank], page: { offset: 7, limit: 2 } }));
            expect(paged).toEqual(all.slice(7, 9));
        });

        it("notifies when a change shifts the page, not for one outside it", async () => {
            await using world = createWorld();
            ranks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(value => [value, 0, false]);
            await world.run(rankAll);
            const seen: (readonly Entity[])[] = [];
            select(world, { required: [rank], order: { [rank]: true }, page: { offset: 1, limit: 3 } })(entities => seen.push(entities));
            await settle(world);
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
            select(world, { required: [rank, second], order })(entities => { full = entities; });
            const pages = [[0, 10], [0, 1], [7, 25], [123, 60], [290, 40], [0, 300], [0, 1000], [350, 5], [40, 0]];
            const latest = pages.map((): readonly Entity[] => []);
            pages.forEach(([offset, limit], index) => {
                select(world, { required: [rank, second], order, page: { offset, limit } })(entities => { latest[index] = entities; });
            });
            await settle(world);
            const check = (): void => pages.forEach(([offset, limit], index) => expect(latest[index]).toEqual(full.slice(offset, offset + limit)));
            check();
            /** Each entity's rank now, by its position in `ranked`. */
            const current = ranks.map(([value]) => value);
            for (let round = 0; round < 5; round++) {
                reranks = Array.from({ length: 40 }, () => [Math.floor(next() * ranked.length), Math.floor(next() * 6)]);
                for (const [index, value] of reranks) current[index] = value;
                await world.run(rerank);
                check();
            }
            for (const ascending of [false, true]) {
                const one = { [rank]: ascending };
                full = await toPromise(select(world, { required: [rank], order: one }));
                expect(await toPromise(select(world, { required: [rank], order: one, page: { offset: 13, limit: 77 } }))).toEqual(full.slice(13, 90));
                const filtered = await toPromise(select(world, { required: [rank], where: { [rank]: { "<": 4 } }, order: one }));
                expect(filtered).toEqual(full.filter(entity => current[ranked.indexOf(entity)] < 4));
                expect(await toPromise(select(world, { required: [rank], where: { [rank]: { "<": 4 } }, order: one, page: { offset: 5, limit: 20 } }))).toEqual(filtered.slice(5, 25));
            }
        });

        it("count and select by where at the bounds of a range, at a component's precision, as each value tests", async () => {
            await using world = createWorld();
            coarseValues = [0, 0.1, 0.1, 0.2, 0.30000001, 1, 1, 2, 3, -1, 0.1000000001];
            await world.run(spawnCoarse);
            const conditions: readonly Condition[] = [0.1, 1, { "<": 0.1 }, { "<=": 0.1 }, { ">": 0.1 }, { ">=": 0.2, "<": 1 }, { ">": 0.1, "<=": 0.1 }, { "<": 1.0000000001 },
                { ">": 0.99999999999 }, { "!=": 1 }, { ">": 0, "!=": 1 }, { "==": 0.1 }, { ">=": 5 }, { "<": -2 }];
            const counts = conditions.map(() => -1);
            const selections = conditions.map((): readonly Entity[] => []);
            conditions.forEach((condition, k) => {
                count(world, { required: [coarse], where: { [coarse]: condition } })(value => { counts[k] = value; });
                select(world, { required: [coarse], where: { [coarse]: condition } })(value => { selections[k] = value; });
            });
            await settle(world);
            for (let round = 0; round < 3; round++) {
                // What each condition passes of every value, read one by one.
                const all = await toPromise(select(world, { required: [coarse] }));
                const values = await Promise.all(all.map(async each => (await toPromise(entity(world, each, { required: [coarse] })))?.[coarse] ?? Number.NaN));
                conditions.forEach((condition, k) => {
                    const passing = all.filter((_, i) => passesCondition(values[i], condition));
                    expect([k, counts[k]]).toEqual([k, passing.length]);
                    expect([k, new Set(selections[k])]).toEqual([k, new Set(passing)]);
                });
                await world.run(shiftCoarse);
            }
        });

        it("leaves count the total", async () => {
            await using world = createWorld();
            ranks = [0, 1, 2, 3, 4].map(value => [value, 0, false]);
            await world.run(rankAll);
            // Not a literal, so its page passes the type: count ignores it.
            const paged = { required: [rank], page: { offset: 1, limit: 2 } } as const;
            expect(await toPromise(count(world, paged))).toBe(5);
        });

        it("throws when subscribing with an offset or limit that isn't a non-negative integer", async () => {
            await using world = createWorld();
            for (const page of [{ offset: -1, limit: 1 }, { offset: 1.5, limit: 1 }, { offset: 0, limit: -1 }, { offset: 0, limit: Number.NaN }]) {
                expect(() => select(world, { required: [rank], page })(() => {})).toThrow("page");
            }
        });
    });
};

for (const adapter of adapters) describe(`${adapter.name} observers`, () => cases(adapter));
