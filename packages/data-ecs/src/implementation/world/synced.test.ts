import { describe, expect, it } from "vitest";
import { Component, Index, Resource, System, report, workers } from "../../index.js";
import { isSynced, requireDefinition } from "../../interface/registry/index.js";
import type { World } from "../../interface/world/world.js";
import { createWorld } from "./create.js";
import { tablesAfterCollecting } from "./lifetime.test-helper.js";
import { createLoop } from "./loop.js";
import { unplaceable } from "./remote-systems.js";

const amount = Symbol("syncedTest/amount");
const cell = Symbol("syncedTest/cell");
const level = Symbol("syncedTest/level");
declare module "@adobe/data-ecs" {
    interface Components {
        [amount]: { type: number };
        [cell]: { type: number };
    }
    interface Resources {
        [level]: { type: number };
    }
}
Component.register(amount, { type: { type: "number" } });
Component.register(cell, { type: { type: "number" } });
Resource.register(level, { type: { type: "number", default: 0 } });

const byCell = Index.create({ name: "syncedTest/byCell", key: [cell] });

/** What synced bodies saw, by system, reset by each test. */
const seen: { levels: number[]; amounts: number[]; counted: number[]; cells: number[]; reports: number[]; removals: number[]; contexts: object[] } = { levels: [], amounts: [], counted: [], cells: [], reports: [], removals: [], contexts: [] };
const reset = (): void => {
    for (const list of Object.values(seen)) list.length = 0;
};

const raise = System.create({ name: "syncedTest/raise", resources: { write: [level] } }, ({ resources }) => { resources[level] += 1; });
const spawn = System.create({ name: "syncedTest/spawn" }, ({ commands }) => { commands.spawn([amount, cell])({ [amount]: 1, [cell]: 7 }); });
const grow = System.create({ name: "syncedTest/grow", components: { write: [amount] } }, row => { row[amount] += 1; });
const nothing = System.create({ name: "syncedTest/nothing" }, () => {});

const watchLevel = System.create({ name: "syncedTest/watchLevel", synced: true, resources: { read: [level] } }, context => {
    seen.levels.push(context.resources[level]);
    seen.contexts.push(context);
});
const watchAmounts = System.create({ name: "syncedTest/watchAmounts", synced: true, components: { read: [amount], changed: [amount] } }, row => { seen.amounts.push(row[amount]); });
const count = System.create({ name: "syncedTest/count", synced: true, components: { has: [amount] } }, () => { seen.counted.push(1); });
const inCell = System.create({ name: "syncedTest/inCell", synced: true, lookup: { found: { index: byCell } } }, ({ lookup }) => {
    seen.cells.push(lookup.found(7).length);
});
const failing = System.create({ name: "syncedTest/failing", synced: true, resources: { read: [level] } }, ({ resources }) => {
    if (resources[level] > 0) throw new Error("synced failed");
});
const watchReport = System.create({ name: "syncedTest/watchReport", synced: true, resources: { read: [report], changed: [report] } }, ({ resources }) => {
    seen.reports.push(resources[report].failures.length);
});
const raiseThenWatch = System.create([raise, watchLevel]);

/** The world a removing body acts on. */
let current: World | null = null;
const removeLevel = System.create({ name: "syncedTest/removeLevel", synced: true }, () => {
    seen.removals.push(1);
    current?.remove(watchLevel);
});

/** Adds `watchLevel` to the world the test runs, during a run. */
const addWatch = System.create({ name: "syncedTest/addWatch" }, () => { current?.add(watchLevel); });
const addLevel = System.create({ name: "syncedTest/addLevel", synced: true }, () => {
    current?.add(watchLevel);
});

const inline = (): ReturnType<typeof createWorld> => createWorld({ [workers]: 0 });

/** A loop platform that counts the beats a world asks for, running none. */
const counting = () => {
    const asked = { frames: 0, timers: 0 };
    return { asked, loop: { frame: () => { asked.frames++; return () => {}; }, timer: () => { asked.timers++; return () => {}; } } };
};

describe("synced systems", () => {
    it("run once after an empty sync point when run alone, with no commands in their context", async () => {
        reset();
        await using world = inline();
        await world.run(raise);
        expect(seen.levels).toEqual([]);
        expect(await world.run(watchLevel)).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        expect(seen.levels).toEqual([1]);
        expect(seen.contexts.map(context => "commands" in context)).toEqual([false]);
    });

    it("run after every run they're added to, reading what its sync point left, each once", async () => {
        reset();
        await using world = inline();
        world.add(count);
        world.add(watchLevel);
        world.add(watchLevel);
        await world.run(spawn);
        expect(seen.counted).toEqual([1]);
        await world.run(raise);
        expect([seen.counted, seen.levels]).toEqual([[1, 1], [0, 1]]);
        // Added and run: once.
        await world.run(watchLevel);
        expect(seen.levels).toEqual([0, 1, 1]);
        // A composite's synced members run after its sync point, with those added, each once.
        await world.run(raiseThenWatch);
        expect(seen.levels).toEqual([0, 1, 1, 2]);
    });

    it("see changes once, by their change filters, and index lookups refreshed for what the sync point moved", async () => {
        reset();
        await using world = inline();
        world.add(watchAmounts);
        world.add(inCell);
        await world.run(spawn);
        expect([seen.amounts, seen.cells]).toEqual([[1], [1]]);
        await world.run(nothing);
        expect(seen.amounts).toEqual([1]);
        await world.run(grow);
        await world.run(spawn);
        expect([seen.amounts, seen.cells]).toEqual([[1, 2, 1], [1, 1, 1, 2]]);
    });

    it("report what they throw as system failures of the run, and every other still runs", async () => {
        reset();
        await using world = inline();
        world.add(failing);
        world.add(watchLevel);
        expect((await world.run(nothing)).failures).toEqual([]);
        const { failures } = await world.run(raise);
        expect(failures.map(({ kind, name, message }) => [kind, name, message])).toEqual([["system", "syncedTest/failing", "synced failed"]]);
        expect(seen.levels).toEqual([0, 1]);
    });

    it("don't make the loop tick, and runs of them alone don't wake it", async () => {
        const { asked, loop } = counting();
        await using world = createWorld({ [workers]: 0 }, { loop });
        world.add(watchLevel);
        await world.run(raise);
        expect(asked).toEqual({ frames: 0, timers: 0 });
        world.add(nothing);
        await world.run(watchLevel);
        expect(asked).toEqual({ frames: 0, timers: 0 });
        await world.run(raise);
        expect(asked.frames).toBe(1);
    });

    it("run after each tick, seeing its report, which then holds their failures without notifying them again", async () => {
        reset();
        await using world = inline();
        world.add(raise);
        world.add(failing);
        world.add(watchReport);
        await world.run(nothing);
        // Observers are delivered after synced systems ran, so they see the report holding their failures.
        await new Promise<void>(resolve => {
            const stop = world.observe.resource(report)(value => {
                if (value.failures.length === 0) return;
                expect(value.failures.map(({ kind, name }) => [kind, name])).toEqual([["system", "syncedTest/failing"]]);
                stop();
                resolve();
            });
        });
        // The run's pass, then the tick's: each saw the report as written, before the failures went in.
        expect(seen.reports).toEqual([0, 0]);
        // Putting the failures in notified nothing: a run of synced systems alone, waking no tick, doesn't run it again.
        const { failures } = await world.run(count);
        expect(failures.map(({ name }) => name)).toEqual(["syncedTest/failing"]);
        expect(seen.reports).toEqual([0, 0]);
    });

    it("leave the composite ticks run as it is when one added alone is removed, and release what it held", async () => {
        const ticked = requireDefinition(nothing);
        const watched = requireDefinition(watchLevel);
        const loop = createLoop({ settings: () => ({ cadence: { kind: "frame" }, always: false, wake: Infinity }), tick: async () => {}, now: () => 0, frame: () => () => {}, timer: () => () => {} });
        loop.add(ticked);
        const composite = loop.current();
        loop.add(watched);
        expect([loop.current(), loop.synced()]).toEqual([composite, [watched]]);
        expect(loop.remove(watched)).toEqual({ previous: composite, next: composite });
        expect([loop.current(), loop.synced()]).toEqual([composite, []]);
        // A composite of synced systems alone doesn't tick.
        loop.remove(ticked);
        loop.add(requireDefinition(System.create([watchLevel, count])));
        expect([loop.current(), loop.synced().length]).toEqual([null, 2]);

        reset();
        const world = inline();
        await world.run(raise);
        await world.run(nothing);
        const before = await tablesAfterCollecting(world);
        world.add(watchLevel);
        await world.run(nothing);
        expect((await world.tables()).runners).toBe(before.runners + 1);
        world.remove(watchLevel);
        await world.run(raise);
        expect(seen.levels).toEqual([1]);
        expect((await tablesAfterCollecting(world)).runners).toBe(before.runners);
        await world.dispose();
    });

    it("register one added alone before the next run, unless it's removed first", async () => {
        const world = inline();
        await world.run(nothing);
        const before = await tablesAfterCollecting(world);
        world.add(count);
        world.remove(count);
        await world.run(nothing);
        expect((await tablesAfterCollecting(world)).runners).toBe(before.runners);
        await world.dispose();
    });

    it("stay while added alone and within an added composite until both are removed", async () => {
        reset();
        await using world = inline();
        const pair = System.create([nothing, watchLevel]);
        world.add(pair);
        world.add(watchLevel);
        await world.run(raise);
        world.remove(pair);
        await world.run(raise);
        world.add(pair);
        world.remove(watchLevel);
        await world.run(raise);
        world.remove(pair);
        await world.run(raise);
        expect(seen.levels).toEqual([1, 2, 3]);
    });

    it("run from the first pass after they register, when added while a run that passes before it is queued", async () => {
        reset();
        await using world = inline();
        current = world;
        // Added during the first run's pass, so the second, queued already, passes before it registers.
        const adding = world.run(addLevel);
        const queued = world.run(raise);
        await Promise.all([adding, queued]);
        await world.run(raise);
        current = null;
        expect(seen.levels).toEqual([2]);
    });

    it("skip one an earlier body removed in the same pass", async () => {
        reset();
        await using world = inline();
        current = world;
        world.add(removeLevel);
        world.add(watchLevel);
        await world.run(raise);
        await world.run(raise);
        current = null;
        expect([seen.removals, seen.levels]).toEqual([[1, 1], []]);
    });

    it("run after the next run once added during a run, whose own pass couldn't run it yet", async () => {
        reset();
        await using world = inline();
        current = world;
        await world.run(addWatch);
        current = null;
        await world.run(raise);
        expect(seen.levels).toEqual([1]);
    });

    it("can be placed on a joined thread", () => {
        const leaf = requireDefinition(watchLevel);
        expect(isSynced(leaf) ? unplaceable(leaf, "main") : "not synced").toBe(null);
    });
});
