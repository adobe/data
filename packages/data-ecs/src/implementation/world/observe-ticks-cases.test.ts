import { describe, expect, it } from "vitest";
import { Component, Resource, System, always, cadence, clock, report, wake, workers } from "../../index.js";
import type { World } from "../../interface/world/world.js";
import { createWorld } from "./create.js";
import { adapters, byDesign, type Adapter } from "./observe-adapters.test-helper.js";

// The observer cases of `ticks.test.ts` and `observed.test.ts`, run for the world's own observers and the factories
// alike.

const frames = Symbol("observeTicksCasesTest/frames");
const seen = Symbol("observeTicksCasesTest/seen");
const value = Symbol("observeTicksCasesTest/value");
const watched = Symbol("observeTicksCasesTest/watched");
const flag = Symbol("observeTicksCasesTest/flag");
declare module "@adobe/data-ecs" {
    interface Resources {
        [frames]: { type: number };
        [seen]: { type: number };
    }
    interface Components {
        [value]: { type: number };
        [watched]: { type: number };
        [flag]: { type: true };
    }
}
Resource.register(frames, { type: { type: "number", default: 0 } });
Resource.register(seen, { type: { type: "number", default: -1 } });
Component.register(value, { type: { type: "number", precision: 1 } });
Component.register(watched, { type: { type: "number", precision: 1 } });
Component.register(flag, { type: { const: true } });

const count = System.create({ name: "observeTicksCasesTest/count", resources: { write: [frames] } }, ({ resources }) => { resources[frames] += 1; });
const watch = System.create({ name: "observeTicksCasesTest/watch", resources: { read: [clock], write: [seen] } }, ({ resources }) => { resources[seen] = resources[clock].tick; });
const fail = System.create({ name: "observeTicksCasesTest/fail" }, () => { throw new Error("tick failed"); });
const nothing = System.create({ name: "observeTicksCasesTest/nothing" }, () => {});
const fast = System.create({ name: "observeTicksCasesTest/fast", resources: { write: [cadence, always] } }, ({ resources }) => {
    resources[cadence] = { kind: "fixed", step: 1 };
    resources[always] = true;
});
const calm = System.create({ name: "observeTicksCasesTest/calm", resources: { write: [always] } }, ({ resources }) => { resources[always] = false; });
const later = System.create({ name: "observeTicksCasesTest/later", resources: { read: [clock] }, reduce: { [wake]: "min" } }, ({ resources, reduce }) => {
    if (resources[clock].tick === 0) reduce[wake](resources[clock].now + 20);
});

const seed = System.create({ name: "observeTicksCasesTest/seed" }, ({ commands }) => {
    for (let i = 0; i < 3000; i++) commands.spawn([value, watched])({ [value]: i, [watched]: 0 });
});
/** Writes every value: until something observes `value`, its stamps are muted. */
const bump = System.create({ name: "observeTicksCasesTest/bump", kernel: "cpu", components: { write: [value] } }, row => {
    row[value] = row[value] + 1;
});
const watchChanged = System.create({ name: "observeTicksCasesTest/watchChanged", kernel: "cpu", components: { write: [watched], changed: [value] }, after: [bump] }, row => {
    row[watched] = row[watched] + 1;
});
/** Counts rows whose `value` was added since it last ran. */
const fresh = System.create({ name: "observeTicksCasesTest/fresh", components: { write: [watched], added: [value] } }, row => {
    row[watched] = row[watched] + 1;
});
const flagAll = System.create({ name: "observeTicksCasesTest/flagAll", components: { has: [value] } }, (row, { commands }) => {
    commands.add(row.entity, flag, true);
});
const spawnOne = System.create({ name: "observeTicksCasesTest/spawnOne" }, ({ commands }) => {
    commands.spawn([value, watched])({ [value]: -1, [watched]: 0 });
});

const pause = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));

const cases = (adapter: Adapter): void => {
    const { resource, entity, select, toPromise } = adapter;

    /** The resource's value once `done` holds of it. */
    const until = <T>(observe: (notify: (value: T) => void) => () => void, done: (value: T) => boolean): Promise<T> => new Promise(resolve => {
        let stop: (() => void) | null = null;
        let finished = false;
        stop = observe(next => {
            if (finished || !done(next)) return;
            finished = true;
            resolve(next);
            stop?.();
        });
        if (finished) stop();
    });

    /** Every entity's `watched`, through the observers. */
    const watchedOf = async (world: World): Promise<number[]> => {
        const entities = await toPromise(select(world, { required: [watched] }));
        return Promise.all(entities.map(async each => (await toPromise(entity(world, each, { required: [watched] })))?.[watched] ?? -1));
    };

    describe("ticks", () => {
        it("run the added systems on the beat after a run arrives, with the clock, and only while one is added", async () => {
            await using world = createWorld({ [workers]: 0 });
            await world.run(nothing);
            await pause(40);
            expect(await toPromise(resource(world, frames))).toBe(0);
            world.add(count);
            world.add(watch);
            await pause(40);
            // A quiet loop runs no tick until a run arrives, and reading doesn't make it.
            expect(await toPromise(resource(world, frames))).toBe(0);
            await world.run(nothing);
            expect(await until(resource(world, frames), next => next === 1)).toBe(1);
            expect(await toPromise(resource(world, seen))).toBe(0);
            const { tick, delta } = await toPromise(resource(world, clock));
            expect([tick, delta]).toEqual([0, 0]);
            await pause(40);
            expect(await toPromise(resource(world, frames))).toBe(1);
        });

        it("keep ticking while always is set, at the cadence's step, and stop when it's cleared or the world is disposed", async () => {
            const world = createWorld({ [workers]: 0 });
            world.add(count);
            await world.run(fast);
            expect(await until(resource(world, frames), next => next >= 5)).toBeGreaterThanOrEqual(5);
            expect((await toPromise(resource(world, clock))).delta).toBe(1);
            await world.run(calm);
            await pause(10);
            const stopped = await toPromise(resource(world, frames));
            await pause(20);
            expect(await toPromise(resource(world, frames))).toBe(stopped);
            const values: number[] = [];
            const stop = resource(world, frames)(next => values.push(next));
            await world.run(fast);
            await until(resource(world, frames), next => next > stopped);
            await world.dispose();
            const disposed = values.length;
            await pause(20);
            expect(values.length).toBe(disposed);
            stop();
        });

        it("tick again at the wake time a system asks for", async () => {
            await using world = createWorld({ [workers]: 0 });
            world.add(later);
            world.add(count);
            await world.run(nothing);
            expect(await until(resource(world, frames), next => next === 2)).toBe(2);
            await pause(40);
            expect(await toPromise(resource(world, frames))).toBe(2);
        });

        it("keep the last tick's report in the report resource", async () => {
            await using world = createWorld({ [workers]: 0 });
            world.add(fail);
            await world.run(nothing);
            const last = await until(resource(world, report), next => next.failures.length > 0);
            expect(last.failures.map(({ kind, name, message }) => [kind, name, message])).toEqual([["system", "observeTicksCasesTest/fail", "tick failed"]]);
        });

        it("report an observer that throws on a tick's values, the tick's report among them, in that tick's report", async () => {
            await using world = createWorld({ [workers]: 0 });
            world.add(count);
            let reports = 0;
            const stop = resource(world, report)(() => {
                // The first call is the current value; the second is the tick's report.
                if (++reports === 2) throw new Error("report observer failed");
            });
            let counts = 0;
            const stopFrames = resource(world, frames)(() => {
                if (++counts === 2) throw new Error("frames observer failed");
            });
            await world.run(nothing);
            await until(resource(world, frames), next => next === 1);
            const ticked = await toPromise(resource(world, report));
            const kind = byDesign(adapter, "system failures") ? "system" : "observer";
            expect(ticked.failures.map(({ kind, message }) => [kind, message]).sort()).toEqual([[kind, "frames observer failed"], [kind, "report observer failed"]]);
            // Nothing of the tick's is left for the next run's report.
            expect((await world.run(nothing)).failures).toEqual([]);
            stop();
            stopFrames();
        });

        it("start the loop's resources at their defaults, workers at null for the platform's choice", async () => {
            await using world = createWorld();
            expect(await toPromise(resource(world, cadence))).toEqual({ kind: "frame" });
            expect(await toPromise(resource(world, always))).toBe(false);
            expect(await toPromise(resource(world, wake))).toBe(Infinity);
            expect(await toPromise(resource(world, workers))).toBe(null);
        });
    });

    describe("tick stamps only where observed", () => {
        it("keep `added` from the moment an observer registers, across archetype moves", async () => {
            const world = createWorld();
            await world.run(seed);
            // Rows that existed before count as added once.
            await world.run(fresh);
            await world.run(fresh);
            expect(new Set(await watchedOf(world))).toEqual(new Set([1]));
            // Moving archetype keeps a row's `added` tick: old rows aren't added again, and a new row still is.
            await world.run(spawnOne);
            await world.run(flagAll);
            await world.run(fresh);
            await world.run(fresh);
            expect((await watchedOf(world)).filter(each => each === 1).length).toBe(3001);
            await world.dispose();
        });

        for (const wasm of [false, true]) {
            it(`start once an observer registers (${wasm ? "WASM" : "JS"} kernels)`, async () => {
                const world = createWorld({ [workers]: 0 }, { wasm });
                await world.run(seed);
                await world.run(bump);
                // New observers see everything once.
                await world.run(watchChanged);
                await world.run(watchChanged);
                expect(new Set(await watchedOf(world))).toEqual(new Set([1]));
                // Writes after registering are stamped, so the observer sees each exactly once.
                await world.run(bump);
                await world.run(watchChanged);
                await world.run(watchChanged);
                expect(new Set(await watchedOf(world))).toEqual(new Set([2]));
                await world.dispose();
            });
        }
    });
};

for (const adapter of adapters) describe(`${adapter.name} observers`, () => cases(adapter));
