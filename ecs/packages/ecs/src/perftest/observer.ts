// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from "../interface/component/component.js";
import type { Entity } from "../interface/entity/entity.js";
import { clock } from "../interface/resources/clock.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";

// Benchmarks read a world as consumers do, through observer systems: a run of one made for a read leaves nothing added
// to the world, so the runs timed after it run what they ran before.

/**
 * Calls `notify` after each tick, and once after the first pass it runs in, from an observer system it adds to `world`
 * filtering on the clock, until the function it returns removes it: how benchmarks count ticks back to back, where that
 * first call only starts the stretch that warms up.
 */
export const eachTick = (world: World, notify: () => void): (() => void) => {
    const counter = System.create({ readonly: true, resources: { changed: [clock] } }, () => { notify(); });
    world.add(counter);
    return () => world.remove(counter);
};

/** The clock as an observer run last read it. */
const read = { tick: 0, now: 0 };
const readClock = System.create({ readonly: true }, ({ resources }) => {
    read.tick = resources[clock].tick;
    read.now = resources[clock].now;
});

/**
 * Resolves once `count` ticks ran after the clock an observer run reads now, which doesn't wake the loop. A tick is
 * told from the clock before it by its count and its `now` together: the first tick's count is 0, as before it, and
 * back-to-back ticks can share a `now` at a coarse timer.
 */
export const ticksAfter = async (world: World, count: number): Promise<void> => {
    await world.run(readClock);
    let { tick, now } = read;
    let seen = 0;
    await new Promise<void>(resolve => {
        const counter = System.create({ readonly: true }, ({ resources }) => {
            const current = resources[clock];
            if (current.tick === tick && current.now === now) return;
            tick = current.tick;
            now = current.now;
            if (++seen < count) return;
            queueMicrotask(() => world.remove(counter));
            resolve();
        });
        world.add(counter);
    });
};

/** The entities with every component of `has` and none of `not`, in storage order, read by an observer run. */
export const entitiesWith = async (world: World, has: readonly Component.Key[], not: readonly Component.Key[] = []): Promise<Entity[]> => {
    const found: Entity[] = [];
    await world.run(System.create({ readonly: true, components: { with: [...has], not } }, row => { found.push(row.entity); }));
    return found;
};

