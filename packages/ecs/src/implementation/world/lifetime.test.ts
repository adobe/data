// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld } from "./create.js";
import { collector, heapAfterCollecting, tablesAfterCollecting } from "./lifetime.test-helper.js";
import { fillReports } from "./reports.test-helper.js";

const count = Symbol("lifetimeTest/count");
const parent = Symbol("lifetimeTest/parent");
const score = Symbol("lifetimeTest/score");

declare module "@adobe/ecs" {
    interface Components {
        [count]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
    }
    interface Resources {
        [score]: { type: number; default: 7 };
    }
}


const seed = System.create({}, ({ commands }) => {
    const root = commands.spawn([count])({ [count]: 1 });
    for (let i = 0; i < 4; i++) commands.spawn([count, parent])({ [count]: i, [parent]: root });
});

/** A module-level system, run between and after the fresh ones, as an app's own systems are. */
const steady = System.create({ components: { with: [count], changed: [count] } }, row => { void row[count]; });

let copied = 0;

/** Fresh systems of each shape that holds something: a body alone, a resource read, a change filter, and `up`. */
const freshSystems = (k: number): readonly System[] => [
    System.create(() => {}),
    System.create({  }, ({ resources }) => { copied = resources[score] + k; }),
    System.create({ components: { with: [count], changed: [count] } }, row => { row[count] += 1; }),
    System.create({ components: { with: [count] }, up: { through: parent } }, (row, { up }) => { copied = row[count] + (up?.[count] ?? 0); }),
];

const fresh = 10_000;

/**
 * Runs `count` fresh systems, each once, then a module-level one. Its own function, since an async function's
 * suspended frame keeps its last locals.
 */
const runFresh = async (world: World, count: number): Promise<void> => {
    for (let k = 0; k < count; k += 4) for (const system of freshSystems(k)) await world.run(system);
    await world.run(steady);
};

describe("what a system holds", () => {
    it("lives as long as the system: fresh systems run once leave every table as it was", async () => {
        expect(collector()).not.toBeNull();
        const world = createWorld({ [workers]: 0 });
        await world.run(seed);
        // Past the runs that spawn reports, which grow the entity table.
        await fillReports(world);
        await runFresh(world, 4);
        const before = await tablesAfterCollecting(world);
        await runFresh(world, fresh);
        const after = await tablesAfterCollecting(world);
        expect(copied).toBeGreaterThan(0);
        expect(after).toEqual(before);
        await world.dispose();
    }, 120_000);

    it("leaves the JS heap where it was once fresh systems run once are collected", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(seed);
        // The first runs compile the paths they take and grow tables to hold what's uncollected between collections.
        await runFresh(world, 2 * fresh);
        const before = await heapAfterCollecting();
        await runFresh(world, 2 * fresh);
        const after = await heapAfterCollecting();
        // About 12 bytes a system, which a kept runner, label or unregister token exceeds, and the heap's noise doesn't.
        expect(after - before).toBeLessThan(250_000);
        await world.dispose();
    }, 120_000);
});
