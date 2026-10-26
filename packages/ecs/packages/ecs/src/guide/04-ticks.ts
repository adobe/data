// © 2026 Adobe. MIT License. See /LICENSE for details.
import { always, cadence, clock, System, wake, World } from "../index.js";

const elapsed = Symbol();
const steps = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [elapsed]: { type: number };
        [steps]: { type: number };
    }
}

const advance = System.create({}, ({ resources }) => {
    resources[elapsed] += resources[clock].delta;
});

let reached: (elapsed: number) => void = () => {};
const watch = System.create({ observer: true, resources: { changed: [elapsed] } }, ({ resources }) => {
    if (resources[elapsed] >= 30) reached(resources[elapsed]);
});

const readTime = System.create({ observer: true }, ({ resources }) => ({ elapsed: resources[elapsed], delta: resources[clock].delta }));

const step = System.create({}, ({ resources, reduce }) => {
    resources[steps] += 1;
    if (resources[steps] < 3) reduce[wake](resources[clock].now);
});

let finished: (steps: number) => void = () => {};
const watchSteps = System.create({ observer: true, resources: { changed: [steps] } }, ({ resources }) => {
    if (resources[steps] === 3) finished(resources[steps]);
});

export const main = async (): Promise<void> => {
    await using world = World.create({ [cadence]: { kind: "fixed", step: 10 }, [always]: true });
    const ticked = new Promise<number>(resolve => { reached = resolve; });
    world.add(advance);
    world.add(watch);
    console.log("elapsed", await ticked, "ms, each tick", (await world.run(readTime)).delta);
    world.remove(advance);
    const stopped = (await world.run(readTime)).elapsed;
    await new Promise(resolve => setTimeout(resolve, 50));
    console.log("stopped", (await world.run(readTime)).elapsed === stopped);

    await using stepping = World.create({ [cadence]: { kind: "fixed", step: 10 } });
    const done = new Promise<number>(resolve => { finished = resolve; });
    stepping.add(step);
    stepping.add(watchSteps);
    // One run arriving ticks once; step's wakes tick twice more.
    await stepping.run(System.create(() => {}));
    console.log("steps", await done);
};
