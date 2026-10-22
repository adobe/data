import { expect, it } from "vitest";
import { always, cadence, clock, Resource, System, wake, World } from "../index.js";

const elapsed = Symbol("elapsed");
const steps = Symbol("steps");

declare module "@adobe/ecs" {
    interface Resources {
        [elapsed]: { type: number };
        [steps]: { type: number };
    }
}

Resource.register(elapsed, { type: { type: "number", default: 0 } });
Resource.register(steps, { type: { type: "number", default: 0 } });

// clock is the current tick's: delta is the milliseconds since the last one.
const advance = System.create({ resources: { read: [clock], write: [elapsed] } }, ({ resources }) => {
    resources[elapsed] += resources[clock].delta;
});

// Added, an observer system reacts to changes: with elapsed in changed, it runs after each tick that changed it.
let reached: (value: number) => void = () => {};
const watch = System.create({ observer: true, resources: { read: [elapsed], changed: [elapsed] } }, ({ resources }) => {
    if (resources[elapsed] >= 30) reached(resources[elapsed]);
});

let read = { elapsed: 0, delta: 0 };
const readTime = System.create({ observer: true, resources: { read: [elapsed, clock] } }, ({ resources }) => {
    read = { elapsed: resources[elapsed], delta: resources[clock].delta };
});

it("runs added systems on every tick", async () => {
    // cadence ticks once per animation frame by default; fixed ticks every step milliseconds, each with that delta.
    // A tick runs only after a run arrives, unless always is set.
    await using world = World.create({ [cadence]: { kind: "fixed", step: 10 }, [always]: true });
    const ticked = new Promise<number>(resolve => { reached = resolve; });
    // add: runs a system on every tick.
    world.add(advance);
    world.add(watch);
    expect(await ticked).toBeGreaterThanOrEqual(30);
    await world.run(readTime);
    expect(read.delta).toBe(10);
    // remove: takes a system added off every tick again.
    world.remove(advance);
    await world.run(readTime);
    const stopped = read.elapsed;
    await new Promise(resolve => setTimeout(resolve, 50));
    await world.run(readTime);
    expect(read.elapsed).toBe(stopped);
});

// A system asks for another tick by contributing a time to wake: the first tick at or after it runs. Work that a tick's
// commands start and a later tick finishes asks for the next one this way.
const step = System.create({ resources: { read: [clock], write: [steps] }, reduce: { [wake]: "min" } }, ({ resources, reduce }) => {
    resources[steps] += 1;
    if (resources[steps] < 3) reduce[wake](resources[clock].now);
});

let finished: (value: number) => void = () => {};
const watchSteps = System.create({ observer: true, resources: { read: [steps], changed: [steps] } }, ({ resources }) => {
    if (resources[steps] === 3) finished(resources[steps]);
});

it("ticks again when a system asks", async () => {
    await using world = World.create({ [cadence]: { kind: "fixed", step: 10 } });
    const done = new Promise<number>(resolve => { finished = resolve; });
    world.add(step);
    world.add(watchSteps);
    // One run arriving ticks once; step's wakes tick twice more.
    await world.run(System.create(() => {}));
    expect(await done).toBe(3);
});
