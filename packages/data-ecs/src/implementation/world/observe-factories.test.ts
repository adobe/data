import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import type { Entity } from "../../interface/entity/entity.js";
import { Resource } from "../../interface/resource/resource.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { Observe } from "../../observe/index.js";
import { createWorld, type CreatedWorld } from "./create.js";
import { settle } from "./observe-adapters.test-helper.js";

// What the factories of `@adobe/data-ecs/observe` do beyond what the world's own observers did: systems shared by shape,
// first values batched or given at once, warm reads, and what they hold released once idle.

const amount = Symbol("observeFactoriesTest/amount");
const other = Symbol("observeFactoriesTest/other");
const level = Symbol("observeFactoriesTest/level");
declare module "@adobe/data-ecs" {
    interface Components {
        [amount]: { type: number };
        [other]: { type: number };
    }
    interface Resources {
        [level]: { type: number };
    }
}
Component.register(amount, { type: { type: "number" } });
Component.register(other, { type: { type: "number" } });
Resource.register(level, { type: { type: "number", default: 0 } });

let spawned: Entity[] = [];
const seed = System.create({ name: "observeFactoriesTest/seed", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    spawned = [];
    for (let i = 0; i < input.count; i++) spawned.push(commands.spawn([amount])({ [amount]: i }));
});
const grow = System.create({ name: "observeFactoriesTest/grow", components: { write: [amount] } }, row => { row[amount] += 1; });
const raise = System.create({ name: "observeFactoriesTest/raise", resources: { write: [level] } }, ({ resources }) => { resources[level] += 1; });
const nothing = System.create({ name: "observeFactoriesTest/nothing" }, () => {});

/** Counts passes: the synced passes after each run's sync point. */
const passes = { count: 0 };
const counter = System.create({ name: "observeFactoriesTest/counter", synced: true }, () => { passes.count++; });

/**
 * A world of `count` entities, each amount its index and one more, at level 1: the runs below registered, so runners
 * count only what observers hold.
 */
const seeded = async (count: number): Promise<CreatedWorld> => {
    const world = createWorld({ [workers]: 0 });
    await world.run(seed, { count });
    await world.run(nothing);
    await world.run(raise);
    await world.run(grow);
    await settle(world);
    return world;
};

const runnersOf = async (world: CreatedWorld): Promise<number> => (await world.tables()).runners;

describe("observer factories", () => {
    it("share one synced system among every observer of one shape, whatever their entities, where values and pages", async () => {
        await using world = await seeded(100);
        const stops = [Observe.entity(world, spawned[0], { required: [amount] })(() => {}), Observe.select(world, { required: [amount], where: { [amount]: 0 } })(() => {})];
        await settle(world);
        const before = await runnersOf(world);
        for (let i = 1; i < 100; i++) stops.push(Observe.entity(world, spawned[i], { required: [amount] })(() => {}));
        for (let i = 1; i < 10; i++) stops.push(Observe.select(world, { required: [amount], where: { [amount]: { ">": i } }, page: { offset: i, limit: 5 } })(() => {}));
        await settle(world);
        expect(await runnersOf(world)).toBe(before);
        for (const stop of stops) stop();
    });

    it("give a value they hold while subscribing, and batch the rest into the runs of one flush", async () => {
        await using world = await seeded(10);
        world.add(counter);
        await settle(world);
        passes.count = 0;
        const values: number[] = [];
        for (let i = 0; i < 10; i++) Observe.entity(world, spawned[i], { required: [amount] })(value => values.push(value?.[amount] ?? -1));
        Observe.select(world, { required: [amount], where: { [amount]: { "<": 5 } } })(() => {});
        Observe.select(world, { required: [amount], where: { [amount]: { "<": 7 } } })(() => {});
        expect(values).toEqual([]);
        await settle(world);
        // A scan for both selections, the delivering run, and the settling run.
        expect(passes.count).toBe(3);
        expect(values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const warm: number[] = [];
        Observe.entity(world, spawned[3], { required: [amount] })(value => warm.push(value?.[amount] ?? -1))();
        expect(warm).toEqual([4]);
    });

    it("stay warm for reads of first values in a loop, then release what they hold once found idle in three passes", async () => {
        await using world = await seeded(10);
        await Observe.toPromise(Observe.resource(world, level));
        await Observe.toPromise(Observe.entity(world, spawned[0], { required: [amount] }));
        const held = await runnersOf(world);
        for (let i = 0; i < 3; i++) {
            const values: number[] = [];
            Observe.resource(world, level)(value => values.push(value))();
            Observe.entity(world, spawned[0], { required: [amount] })(value => values.push(value?.[amount] ?? -1))();
            expect(values).toEqual([1 + i, 1 + i]);
            await world.run(raise);
            await world.run(grow);
        }
        expect(await runnersOf(world)).toBe(held);
        // The resource's and the entity's systems.
        await world.run(nothing);
        expect(await runnersOf(world)).toBe(held - 2);
        // Used again, they're added again, and cold.
        const values: number[] = [];
        Observe.resource(world, level)(value => values.push(value))();
        expect(values).toEqual([]);
        expect(await Observe.toPromise(Observe.resource(world, level))).toBe(4);
        expect(await runnersOf(world)).toBe(held - 1);
    });

    it("track a query only once a subscriber outlives its first value", async () => {
        await using world = await seeded(10);
        expect(await Observe.toPromise(Observe.count(world, { required: [amount], where: { [amount]: { ">=": 5 } } }))).toBe(6);
        const scanned = await runnersOf(world);
        await world.run(nothing);
        expect(await runnersOf(world)).toBe(scanned);
        const counts: number[] = [];
        const stop = Observe.count(world, { required: [amount], where: { [amount]: { ">=": 5 } } })(value => counts.push(value));
        await settle(world);
        expect(await runnersOf(world)).toBe(scanned + 1);
        await world.run(grow);
        expect(counts).toEqual([6, 7]);
        stop();
        await world.run(nothing);
        await world.run(nothing);
        await world.run(nothing);
        expect(await runnersOf(world)).toBe(scanned);
    });

    it("keep the values of observers of another world apart", async () => {
        await using first = await seeded(3);
        await using second = await seeded(5);
        expect(await Promise.all([Observe.toPromise(Observe.count(first, {})), Observe.toPromise(Observe.count(second, {}))])).toEqual([3, 5]);
        await first.run(raise);
        expect(await Promise.all([Observe.toPromise(Observe.resource(first, level)), Observe.toPromise(Observe.resource(second, level))])).toEqual([2, 1]);
    });

    it("read only what they list, so a write elsewhere notifies nothing", async () => {
        await using world = await seeded(3);
        const writeOther = System.create({ name: "observeFactoriesTest/writeOther", components: { write: [other] } }, row => { row[other] = 1; });
        let notified = 0;
        Observe.entity(world, spawned[0], { required: [amount] })(() => notified++);
        Observe.select(world, { required: [amount], order: { [amount]: false }, page: { offset: 0, limit: 2 } })(() => notified++);
        Observe.count(world, { required: [amount] })(() => notified++);
        await settle(world);
        await world.run(writeOther);
        await world.run(nothing);
        expect(notified).toBe(3);
    });
});
