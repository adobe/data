import type { Component } from "../interface/component/component.js";
import type { Entity } from "../interface/entity/entity.js";
import { clock } from "../interface/resources/clock.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";

// Benchmarks read a world as consumers do, through synced systems: a run of one made for a read leaves nothing added
// to the world, so the runs timed after it run what they ran before.

/**
 * Calls `notify` after each pass whose clock is a tick's other than the last it saw, starting from the clock of `after`
 * (a tick's `now`, as `nowOf` reads it), from a synced system it adds to `world`, until the function it returns removes
 * it: how benchmarks count ticks. A tick's `now` tells it from the last, as its count doesn't from the clock before the
 * first.
 */
export const eachTick = (world: World, notify: () => void, after = Number.NaN): (() => void) => {
    let last = after;
    const counter = System.create({ name: "perftest/eachTick", synced: true, resources: { read: [clock] } }, ({ resources }) => {
        const { now } = resources[clock];
        if (now === last) return;
        last = now;
        notify();
    });
    world.add(counter);
    return () => world.remove(counter);
};

let read = Number.NaN;
const readNow = System.create({ name: "perftest/readNow", synced: true, resources: { read: [clock] } }, ({ resources }) => { read = resources[clock].now; });

/** The clock's `now`, read by a synced run, which doesn't wake the loop. */
export const nowOf = async (world: World): Promise<number> => {
    await world.run(readNow);
    return read;
};

/** The entities with every component of `has` and none of `not`, in storage order, read by a synced run. */
export const entitiesWith = async (world: World, has: readonly Component.Key[], not: readonly Component.Key[] = []): Promise<Entity[]> => {
    const found: Entity[] = [];
    await world.run(System.create({ synced: true, components: { has, not } }, row => { found.push(row.entity); }));
    return found;
};

