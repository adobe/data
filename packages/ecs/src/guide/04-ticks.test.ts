import { expect, it } from "vitest";
import { always, cadence, clock, Resource, System, World } from "../index.js";

const elapsed = Symbol("elapsed");

declare module "@adobe/ecs" {
    interface Resources {
        [elapsed]: { type: number };
    }
}

Resource.register(elapsed, { type: { type: "number", default: 0 } });

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
