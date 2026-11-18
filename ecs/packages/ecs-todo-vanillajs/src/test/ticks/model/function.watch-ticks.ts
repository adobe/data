// © 2026 Adobe. MIT License. See /LICENSE for details.
import { clock, System, type World } from "@adobe/ecs";
import { waiting } from "./internal/constant.waiting.js";

/** Lets `nextTick` resolve after `world`'s ticks: awaited once, before the world's first run. */
export const watchTicks = async (world: World): Promise<void> => {
    world.add(ticked);
    // Its first pass, which isn't a tick's.
    await world.run(ticked);
};

/** Passes after each tick, the only passes that change the clock, and on its first. */
const ticked = System.create({ readonly: true, resources: { changed: [clock] } }, () => {
    for (const resolve of waiting.splice(0)) resolve();
});
