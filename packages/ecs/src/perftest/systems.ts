// © 2026 Adobe. MIT License. See /LICENSE for details.
import { always } from "../interface/resources/always.js";
import { eachTick, ticksAfter } from "./observer.js";
import { System } from "../interface/system/system.js";
import { backToBack, createWorld } from "../implementation/index.js";
import { retainedRuns } from "../implementation/world/reports.js";
import type { Benchmark } from "./benchmark.js";
import { idle } from "./suite.js";

// Benchmarks of systems added to ticks and removed again while a world ticks back to back.

const level = Symbol("systems/level");
declare module "@adobe/ecs" {
    export interface Components {
        [level]: { type: number };
    }
}

/** Entities the added systems read. */
const entities = 100;

const seed = System.create({ name: "systems/seed" }, ({ commands }) => {
    for (let i = 0; i < entities; i++) commands.spawn([level])({ [level]: i });
});

let read = 0;

/** A new system for each tick: a change filter, which counts as watching `level`, and rows to read. */
const fresh = (): System => System.create({ components: { read: [level], changed: [level] } }, row => { read += row[level]; });

/** One module's system, added and removed again and again. */
const again = System.create({ name: "systems/again", components: { read: [level], changed: [level] } }, row => { read += row[level]; });

/** Ticks in each timed stretch. */
export const churnTicks = 10_000;

const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
};

/**
 * The fastest of `stretches` stretches of `churnTicks` ticks, after one to warm up, of a world with `idle` added and,
 * with `churn`, a system made for each tick added to the next and removed from the one after, by an observer system
 * reading its clock; then, with `after`, ticks with nothing added or removed. What the world holds is the same before
 * and after.
 */
const churning = async (churn: (() => System) | null, after: boolean, stretches = 5): Promise<number> => {
    const driver = backToBack();
    const world = createWorld({ [always]: true }, { loop: driver });
    let best = Infinity;
    try {
        await world.run(seed);
        world.add(idle);
        // Once a system with the filter came and went, ticks are kept for what it filters on, and the loop's state is
        // added.
        world.add(again);
        await ticksAfter(world, 2);
        world.remove(again);
        // The world keeps the reports of its last runs and ticks, so it holds what it will hold once it has that many.
        await ticksAfter(world, retainedRuns);
        await world.run(idle);
        const before = await world.tables();
        let added: System | null = null;
        const stretch = (churned: (() => System) | null): Promise<void> => new Promise<void>(resolve => {
            let ticks = 0;
            let stretched = 0;
            let start = 0;
            const unobserve = eachTick(world, () => {
                if (churned !== null) {
                    if (added !== null) world.remove(added);
                    added = churned();
                    world.add(added);
                }
                if (ticks++ % churnTicks !== 0) return;
                const now = performance.now();
                // The first stretch warms up.
                if (stretched > 1) best = Math.min(best, now - start);
                start = now;
                if (stretched++ <= stretches) return;
                unobserve();
                if (added !== null) world.remove(added);
                added = null;
                resolve();
            });
        });
        if (after) {
            await stretch(churn);
            best = Infinity;
            await stretch(null);
        }
        else await stretch(churn);
        // A run, so what removed systems held is released before the world's tables are read.
        await world.run(idle);
        const held = await world.tables();
        check(held.runners === before.runners && held.arena === before.arena && held.observed === before.observed, `systems: the world holds ${JSON.stringify(held)} after, against ${JSON.stringify(before)} before`);
        check(read > 0 || churn === null, "systems: nothing read");
    }
    finally {
        await world.dispose();
        driver.close();
    }
    return best;
};

const tickBest = { bytes: 64, basis: "A tick reads at least one cache line of its systems' state." };

export const systemBenchmarks: readonly Benchmark[] = [
    {
        name: "loop tick add remove",
        operation: "Ticks back to back, each adding a new system with a change filter over 100 rows and removing the one the last tick added: systems that come and go with what a UI shows.",
        per: "ticks",
        n: churnTicks,
        typical: [1, 1],
        best: tickBest,
        run: () => churning(fresh, false),
    },
    {
        name: "loop tick add remove again",
        operation: "Ticks back to back, each adding or removing one module's system with a change filter over 100 rows: a feature switched on and off.",
        per: "ticks",
        n: churnTicks,
        typical: [1, 1],
        best: tickBest,
        run: () => churning(() => again, false),
    },
    {
        name: "loop tick idle after add remove",
        operation: "Ticks with nothing changed after 60,000 ticks that each added a new system and removed the last: what systems that came and went leave behind in every tick.",
        per: "ticks",
        n: churnTicks,
        typical: [1, 1],
        best: tickBest,
        run: () => churning(fresh, true),
    },
];
