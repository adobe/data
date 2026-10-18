import { expect, it } from "vitest";
import { Observe, Resource, System, always, cadence, clock } from "../index.js";
import { createWorld } from "../implementation/index.js";

const elapsed = Symbol("elapsed");

declare module "@adobe/data-ecs" {
    interface Resources {
        [elapsed]: { type: number };
    }
}

Resource.register(elapsed, { type: { type: "number", default: 0 } });

// clock is the current tick's: delta is the milliseconds since the last one.
const advance = System.create({ resources: { read: [clock], write: [elapsed] } }, ({ resources }) => {
    resources[elapsed] += resources[clock].delta;
});

it("runs added systems on every tick", async () => {
    // cadence ticks once per animation frame by default; fixed ticks every step milliseconds, each with that delta.
    // A tick runs only after a run arrives, unless always is set.
    await using world = createWorld({ [cadence]: { kind: "fixed", step: 10 }, [always]: true });
    // add: runs a system on every tick.
    world.add(advance);
    // An observer is notified when its value changes, at most once per frame.
    const ticked = new Promise<number>(resolve => world.observe.resource(elapsed)(value => { if (value >= 30) resolve(value); }));
    expect(await ticked).toBeGreaterThanOrEqual(30);
    expect((await Observe.toPromise(world.observe.resource(clock))).delta).toBe(10);
});
