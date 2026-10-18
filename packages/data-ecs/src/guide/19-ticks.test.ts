import { expect, it } from "vitest";
import { Resource, System, always, cadence, clock, report, wake } from "../index.js";
import { toPromise } from "../interface/observe/to-promise.js";
import { createWorld } from "../implementation/index.js";

const elapsed = Symbol("guide/ticks/elapsed");
const alarm = Symbol("guide/ticks/alarm");

declare module "@adobe/data-ecs" {
    interface Resources {
        [elapsed]: { type: number };
        [alarm]: { type: number };
    }
}

Resource.register(elapsed, { type: { type: "number", default: 0 } });
Resource.register(alarm, { type: { type: "number", default: 0 } });

// A tick runs every added system, after the world writes the clock.
const advance = System.create({ name: "guide/ticks/advance", resources: { read: [clock], write: [elapsed] } }, ({ resources }) => {
    resources[elapsed] += resources[clock].delta;
});
// A system asks for a later tick through `wake`; the loop is quiet in between.
const remind = System.create({ name: "guide/ticks/remind", resources: { read: [clock], write: [alarm] }, reduce: { [wake]: "min" } }, ({ resources, reduce }) => {
    if (resources[clock].tick === 0) reduce[wake](resources[clock].now + 10);
    else resources[alarm] += 1;
});
// Fixed steps of 5 milliseconds, every beat.
const pace = System.create({ name: "guide/ticks/pace", resources: { write: [cadence, always] } }, ({ resources }) => {
    resources[cadence] = { kind: "fixed", step: 5 };
    resources[always] = true;
});

// Any run, such as a transaction from the UI.
const start = System.create({ name: "guide/ticks/start" }, () => {});

/** The first value `observe` gives that `done` holds of. */
const until = <T>(observe: (notify: (value: T) => void) => () => void, done: (value: T) => boolean): Promise<T> => new Promise(resolve => {
    let finished = false;
    let stop: (() => void) | null = null;
    stop = observe(value => {
        if (finished || !done(value)) return;
        finished = true;
        resolve(value);
        stop?.();
    });
    if (finished) stop();
});

it("ticks the added systems on the cadence's beats when a run arrives or a wake time comes", async () => {
    await using world = createWorld();
    world.add(remind);
    // An arriving run is a reason to tick.
    await world.run(start);
    expect(await until(world.observe.resource(alarm), value => value === 1)).toBe(1);
    expect((await toPromise(world.observe.resource(report))).failures).toEqual([]);
});

it("ticks every beat while always is set, each fixed step adding its delta", async () => {
    await using world = createWorld();
    world.add(advance);
    await world.run(pace);
    expect(await until(world.observe.resource(elapsed), value => value >= 20)).toBeGreaterThanOrEqual(20);
    expect((await toPromise(world.observe.resource(clock))).delta).toBe(5);
});
