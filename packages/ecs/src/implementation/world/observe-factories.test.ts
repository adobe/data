// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it, vi } from "vitest";
import type { Entity } from "../../interface/entity/entity.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { Observe } from "../../observe/index.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join, type CreatedWorld } from "./create.js";
import { tablesOf } from "./join.js";
import { settle } from "./observe.test-helper.js";
import { runReported } from "./reports.test-helper.js";

// How the internal factories of `src/observe` run: systems shared by shape, first values batched or given at once, warm
// reads, and what they hold released once idle.

const amount = Symbol("observeFactoriesTest/amount");
const other = Symbol("observeFactoriesTest/other");
const level = Symbol("observeFactoriesTest/level");
declare module "@adobe/ecs" {
    interface Components {
        [amount]: { type: number };
        [other]: { type: number };
    }
    interface Resources {
        [level]: { type: number };
    }
}

let spawned: Entity[] = [];
const seed = System.create({}, ({ commands }, input: { readonly count: number }) => {
    spawned = [];
    for (let i = 0; i < input.count; i++) spawned.push(commands.spawn([amount])({ [amount]: i }));
});
const grow = System.create({ components: { with: [amount] } }, row => { row[amount] += 1; });
const raise = System.create({  }, ({ resources }) => { resources[level] += 1; });
const nothing = System.create({}, () => {});

/** Counts passes: the observer passes after each run's sync point. */
const passes = { count: 0 };
const counter = System.create({ observer: true }, () => { passes.count++; });

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
    it("share one observer system among every observer of one shape, whatever their entities, where values and pages", async () => {
        await using world = await seeded(100);
        const stops = [Observe.entity(world, spawned[0], { required: [amount] })(() => {}), Observe.select(world, { required: [amount], where: { [amount]: 0 }, page: { offset: 0, limit: 5 } })(() => {})];
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
        // An entity observer's system, added again, reads through its new lookups.
        const entities: unknown[] = [];
        const stop = Observe.entity(world, spawned[0], { required: [amount] })(value => entities.push(value?.[amount]));
        await settle(world);
        await world.run(grow);
        await world.run(System.create({ components: { with: [amount] } }, row => {
            if (row.entity !== spawned[0]) row[amount] += 1;
        }));
        expect(entities).toEqual([4, 5]);
        stop();
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

    it("notify subscribers whose first value was one held, while subscribing, of every later change", async () => {
        await using world = await seeded(3);
        const held = [Observe.resource(world, level)(() => {}), Observe.entity(world, spawned[0], { required: [amount] })(() => {}), Observe.count(world, { required: [amount], where: { [amount]: { ">": 1 } } })(() => {})];
        await settle(world);
        const levels: number[] = [];
        const amounts: number[] = [];
        const counts: number[] = [];
        const stops = [
            Observe.resource(world, level)(value => levels.push(value)),
            Observe.entity(world, spawned[0], { required: [amount] })(value => amounts.push(value?.[amount] ?? -1)),
            Observe.count(world, { required: [amount], where: { [amount]: { ">": 1 } } })(value => counts.push(value)),
        ];
        await world.run(raise);
        await world.run(grow);
        await world.run(grow);
        expect([levels, amounts, counts]).toEqual([[1, 2], [1, 2, 3], [2, 3]]);
        for (const stop of [...held, ...stops]) stop();
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
        const writeOther = System.create({ components: { with: [other] } }, row => { row[other] = 1; });
        let notified = 0;
        Observe.entity(world, spawned[0], { required: [amount] })(() => notified++);
        Observe.select(world, { required: [amount], order: { [amount]: false }, page: { offset: 0, limit: 2 } })(() => notified++);
        Observe.count(world, { required: [amount] })(() => notified++);
        await settle(world);
        await world.run(writeOther);
        await world.run(nothing);
        expect(notified).toBe(3);
    });

    it("rethrow only their own systems' failures from their runs, not those of observer systems the world added", async () => {
        await using world = await seeded(3);
        const failing = System.create({ observer: true }, () => { throw new Error("added failed"); });
        world.add(failing);
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
            // Cold first values, from runs of the factories' own, each running the added system too.
            expect(await Observe.toPromise(Observe.resource(world, level))).toBe(1);
            expect(await Observe.toPromise(Observe.count(world, { required: [amount] }))).toBe(3);
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        finally {
            vi.restoreAllMocks();
        }
        expect(caught).toEqual([]);
        // The world's runs still report it.
        expect((await runReported(world, nothing)).failures.map(failure => failure.name)).toEqual(["failing"]);
    });
});

/** A world of `count` entities as `seeded` makes them, and a thread joined to it through a channel. */
const seededJoined = async (count: number): Promise<{ readonly world: CreatedWorld; readonly remote: World; readonly close: () => Promise<void> }> => {
    const world = await seeded(count);
    const channel = new MessageChannel();
    world.share(channel.port1);
    const remote = join(channel.port2, { threads: [] });
    await remote.run(nothing);
    return {
        world, remote,
        close: async () => {
            await remote.dispose();
            await world.dispose();
        },
    };
};

/** How many observer systems are placed on a joined thread. */
const placedOn = (remote: World): number => tablesOf.get(remote)?.().observer ?? -1;

/** A few turns of the event loop, which a joined thread's posts need. */
const turns = async (count = 20): Promise<void> => {
    for (let turn = 0; turn < count; turn++) await new Promise(resolve => setTimeout(resolve, 0));
};

describe("observer factories on a joined thread", () => {
    it("share one observer system there among every observer of one shape, and notify each of every later change", async () => {
        const { world, remote, close } = await seededJoined(20);
        const amounts: number[] = [];
        const stops = [
            Observe.entity(remote, spawned[0], { required: [amount] })(value => amounts.push(value?.[amount] ?? -1)),
            Observe.select(remote, { required: [amount], where: { [amount]: { ">": 10 } }, order: { [amount]: false }, page: { offset: 0, limit: 3 } })(() => {}),
            Observe.resource(remote, level)(() => {}),
        ];
        await Observe.toPromise(Observe.count(remote, { required: [amount] }));
        const placed = placedOn(remote);
        for (let i = 1; i < 20; i++) stops.push(Observe.entity(remote, spawned[i], { required: [amount] })(() => {}));
        for (let i = 1; i < 5; i++) stops.push(Observe.select(remote, { required: [amount], where: { [amount]: { ">": i } }, order: { [amount]: false }, page: { offset: i, limit: 3 } })(() => {}));
        const levels: number[] = [];
        stops.push(Observe.resource(remote, level)(value => levels.push(value)));
        expect(await Observe.toPromise(Observe.select(remote, { required: [amount], where: { [amount]: { ">": 1 } }, order: { [amount]: false }, page: { offset: 1, limit: 3 } }))).toEqual([spawned[18], spawned[17], spawned[16]]);
        expect(placedOn(remote)).toBe(placed);
        // Held, so given while subscribing.
        expect(levels).toEqual([1]);
        await world.run(raise);
        await world.run(grow);
        await turns();
        expect([amounts, levels]).toEqual([[1, 2], [1, 2]]);
        for (const stop of stops) stop();
        await close();
    });

    it("give cold first values from a run after the thread's runs called before subscribing", async () => {
        const { remote, close } = await seededJoined(3);
        void remote.run(seed, { count: 5 });
        const count = Observe.toPromise(Observe.count(remote, { required: [amount] }));
        void remote.run(raise);
        const resource = Observe.toPromise(Observe.resource(remote, level));
        expect(await Promise.all([count, resource])).toEqual([8, 2]);
        await close();
    });

    it("release what they place there once found idle in three turns that ran them", async () => {
        const { world, remote, close } = await seededJoined(3);
        const before = placedOn(remote);
        const stop = Observe.entity(remote, spawned[0], { required: [amount] })(() => {});
        expect(await Observe.toPromise(Observe.resource(remote, level))).toBe(1);
        expect(placedOn(remote)).toBe(before + 2);
        stop();
        for (let k = 0; k < 4; k++) {
            await world.run(raise);
            await turns(5);
        }
        expect(placedOn(remote)).toBe(before);
        // Used again, added again.
        expect(await Observe.toPromise(Observe.resource(remote, level))).toBe(5);
        await close();
    });
});

describe("Observe.toPromise", () => {
    it("resolves to the first value and stops observing, even when it comes while subscribing", async () => {
        let stopped = 0;
        const observe: Observe<number> = notify => { notify(1); notify(2); return () => { stopped++; }; };
        expect(await Observe.toPromise(observe)).toBe(1);
        expect(stopped).toBe(1);
    });
});
