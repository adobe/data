// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, clock, type World } from "@adobe/ecs";

const waiting: (() => void)[] = [];

/** Passes after each tick, the only passes that change the clock, and on its first. */
const ticked = System.create({ observer: true, resources: { changed: [clock] } }, () => {
    for (const resolve of waiting.splice(0)) resolve();
});

/** Lets `nextTick` resolve after `world`'s ticks: awaited once, before the world's first run. */
export const watchTicks = async (world: World): Promise<void> => {
    world.add(ticked);
    // Its first pass, which isn't a tick's.
    await world.run(ticked);
};

/** Resolves after the next tick's observer systems ran: the DOM shows what the runs before it changed. */
export const nextTick = (): Promise<void> => new Promise(resolve => waiting.push(resolve));

/** Waits for a run, then for the tick after it. */
export const settled = async <T>(run: Promise<T>): Promise<T> => {
    const ran = await run;
    await nextTick();
    return ran;
};
