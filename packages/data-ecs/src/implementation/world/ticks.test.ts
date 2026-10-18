import { describe, expect, it } from "vitest";
import { Resource, System, always, cadence, clock, report, wake, workers } from "../../index.js";
import { toPromise } from "../../interface/observe/to-promise.js";
import { createWorld } from "./create.js";

const frames = Symbol("ticksTest/frames");
const seen = Symbol("ticksTest/seen");
declare module "@adobe/data-ecs" {
    interface Resources {
        [frames]: { type: number };
        [seen]: { type: number };
    }
}
Resource.register(frames, { type: { type: "number", default: 0 } });
Resource.register(seen, { type: { type: "number", default: -1 } });

const count = System.create({ name: "ticksTest/count", resources: { write: [frames] } }, ({ resources }) => { resources[frames] += 1; });
const watch = System.create({ name: "ticksTest/watch", resources: { read: [clock], write: [seen] } }, ({ resources }) => { resources[seen] = resources[clock].tick; });
const fail = System.create({ name: "ticksTest/fail" }, () => { throw new Error("tick failed"); });
const nothing = System.create({ name: "ticksTest/nothing" }, () => {});
const fast = System.create({ name: "ticksTest/fast", resources: { write: [cadence, always] } }, ({ resources }) => {
    resources[cadence] = { kind: "fixed", step: 1 };
    resources[always] = true;
});
const calm = System.create({ name: "ticksTest/calm", resources: { write: [always] } }, ({ resources }) => { resources[always] = false; });
const later = System.create({ name: "ticksTest/later", resources: { read: [clock] }, reduce: { [wake]: "min" } }, ({ resources, reduce }) => {
    if (resources[clock].tick === 0) reduce[wake](resources[clock].now + 20);
});

/** The resource's value once `done` holds of it. */
const until = <T>(observe: (notify: (value: T) => void) => () => void, done: (value: T) => boolean): Promise<T> => new Promise(resolve => {
    let stop: (() => void) | null = null;
    let finished = false;
    stop = observe(value => {
        if (finished || !done(value)) return;
        finished = true;
        resolve(value);
        stop?.();
    });
    if (finished) stop();
});

const pause = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));

describe("ticks", () => {
    it("run the added systems on the beat after a run arrives, with the clock, and only while one is added", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(nothing);
        await pause(40);
        expect(await toPromise(world.observe.resource(frames))).toBe(0);
        world.add(count);
        world.add(watch);
        await pause(40);
        // A quiet loop runs no tick until a run arrives.
        expect(await toPromise(world.observe.resource(frames))).toBe(0);
        await world.run(nothing);
        expect(await until(world.observe.resource(frames), value => value === 1)).toBe(1);
        expect(await toPromise(world.observe.resource(seen))).toBe(0);
        const { tick, delta } = await toPromise(world.observe.resource(clock));
        expect([tick, delta]).toEqual([0, 0]);
        await pause(40);
        expect(await toPromise(world.observe.resource(frames))).toBe(1);
    });

    it("keep ticking while always is set, at the cadence's step, and stop when it's cleared or the world is disposed", async () => {
        const world = createWorld({ [workers]: 0 });
        world.add(count);
        await world.run(fast);
        expect(await until(world.observe.resource(frames), value => value >= 5)).toBeGreaterThanOrEqual(5);
        expect((await toPromise(world.observe.resource(clock))).delta).toBe(1);
        await world.run(calm);
        await pause(10);
        const stopped = await toPromise(world.observe.resource(frames));
        await pause(20);
        expect(await toPromise(world.observe.resource(frames))).toBe(stopped);
        await world.run(fast);
        await until(world.observe.resource(frames), value => value > stopped);
        await world.dispose();
        const disposed = await toPromise(world.observe.resource(frames));
        await pause(20);
        expect(await toPromise(world.observe.resource(frames))).toBe(disposed);
    });

    it("tick again at the wake time a system asks for", async () => {
        await using world = createWorld({ [workers]: 0 });
        world.add(later);
        world.add(count);
        await world.run(nothing);
        expect(await until(world.observe.resource(frames), value => value === 2)).toBe(2);
        await pause(40);
        expect(await toPromise(world.observe.resource(frames))).toBe(2);
    });

    it("keep the last tick's report in the report resource", async () => {
        await using world = createWorld({ [workers]: 0 });
        world.add(fail);
        await world.run(nothing);
        const last = await until(world.observe.resource(report), value => value.failures.length > 0);
        expect(last.failures.map(({ kind, name, message }) => [kind, name, message])).toEqual([["system", "ticksTest/fail", "tick failed"]]);
    });

    it("report an observer that throws on a tick's values, the tick's report among them, in that tick's report", async () => {
        await using world = createWorld({ [workers]: 0 });
        world.add(count);
        let reports = 0;
        const stop = world.observe.resource(report)(() => {
            // The first call is the current value, during subscribing; the second is the tick's report.
            if (++reports === 2) throw new Error("report observer failed");
        });
        let counts = 0;
        const stopFrames = world.observe.resource(frames)(() => {
            if (++counts === 2) throw new Error("frames observer failed");
        });
        await world.run(nothing);
        await until(world.observe.resource(frames), value => value === 1);
        const ticked = await toPromise(world.observe.resource(report));
        expect(ticked.failures.map(({ kind, message }) => [kind, message]).sort()).toEqual([["observer", "frames observer failed"], ["observer", "report observer failed"]]);
        // Nothing of the tick's is left for the next run's report.
        expect((await world.run(nothing)).failures).toEqual([]);
        stop();
        stopFrames();
    });

    it("reject a system that conflicts with one added with no order between them, and one with input", async () => {
        const other = System.create({ name: "ticksTest/other", resources: { write: [frames] } }, ({ resources }) => { resources[frames] = 0; });
        const withInput = System.create({ name: "ticksTest/withInput", input: { type: "object", properties: { by: { type: "number" } } } }, () => {});
        await using world = createWorld({ [workers]: 0 });
        world.add(count);
        expect(() => world.add(other)).toThrow('both access "ticksTest/frames"');
        // @ts-expect-error a system with input can't be added
        expect(() => world.add(withInput)).toThrow("takes input");
    });
});

describe("World.create", () => {
    it("rejects starting a resource only the world writes", () => {
        // @ts-expect-error clock is written only by the world
        expect(() => createWorld({ [clock]: { now: 0, delta: 0, tick: 0 } })).toThrow('"clock" is written only by the world');
        // @ts-expect-error report is written only by the world
        expect(() => createWorld({ [report]: { failures: [], skipped: [], dropped: 0 } })).toThrow('"report" is written only by the world');
    });

    it("starts the loop's resources at their defaults, workers at null for the platform's choice", async () => {
        await using world = createWorld();
        expect(await toPromise(world.observe.resource(cadence))).toEqual({ kind: "frame" });
        expect(await toPromise(world.observe.resource(always))).toBe(false);
        expect(await toPromise(world.observe.resource(wake))).toBe(Infinity);
        expect(await toPromise(world.observe.resource(workers))).toBe(null);
    });
});
