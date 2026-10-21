import { describe, expect, it } from "vitest";
import { Component, Index, Report, Resource, System, clock, workers } from "../../index.js";
import { createWorld } from "./create.js";
import { createReports, retainedRuns } from "./reports.js";
import type { CommandBuffer } from "./buffer.js";
import type { RunReport } from "./failures.js";
import { createState } from "./state.js";
import { applySync, prepareSync, synchronizeAlone } from "./synchronize.js";
import { reportOf } from "./reports.test-helper.js";

const amount = Symbol("reportsTest/amount");
const level = Symbol("reportsTest/level");
declare module "@adobe/data-ecs" {
    interface Components {
        [amount]: { type: number };
    }
    interface Resources {
        [level]: { type: number };
    }
}
Component.register(amount, { type: { type: "number" } });
Resource.register(level, { type: { type: "number", default: 0 } });

const nothing = System.create({ name: "reportsTest/nothing" }, () => {});
const fail = System.create({ name: "reportsTest/fail" }, () => { throw new Error("run failed"); });
const raise = System.create({ name: "reportsTest/raise", resources: { write: [level] } }, ({ resources }) => { resources[level] += 1; });
const idle = System.create({ name: "reportsTest/idle", observer: true }, () => {});
const spawn = System.create({ name: "reportsTest/spawn" }, ({ commands }) => { commands.spawn([amount])({ [amount]: 1 }); });
const despawnAll = System.create({ name: "reportsTest/despawnAll", components: { has: [amount] } }, (row, { commands }) => {
    commands.despawn(row.entity);
    commands.despawn(row.entity);
});
const failingObserver = System.create({ name: "reportsTest/failingObserver", observer: true, resources: { read: [level], changed: [level] } }, ({ resources }) => {
    if (resources[level] > 0) throw new Error("observer failed");
});

/** What a logger following reports saw, by pass: each changed report's run and failures' messages. */
const logged: (readonly [number, readonly string[]])[] = [];
const logger = System.create({ name: "reportsTest/logger", observer: true, components: { read: [Report.run, Report.failures], changed: [Report.failures] } }, row => {
    logged.push([row[Report.run], row[Report.failures].map(failure => failure.message)]);
});

/** The run numbers of every report, oldest first. */
let numbers: number[] = [];
const allReports = Index.create({ name: "reportsTest/allReports", key: [], components: { has: [Report.run] } });
const listReports = System.create({ name: "reportsTest/listReports", observer: true, lookup: { all: { index: Report.byRun, read: [Report.run] }, any: { index: allReports } } }, ({ lookup }) => {
    const all = lookup.all();
    numbers = [];
    for (let i = 0; i < all.length; i++) numbers.push(all.at(i)[Report.run]);
    if (lookup.any().length !== all.length) throw new Error("a report without every component");
});

const inline = () => createWorld({ [workers]: 0 });

describe("reports", () => {
    it("number every run in order, one of observer systems alone included, and spawn none for a clean run", async () => {
        await using world = inline();
        expect(await world.run(nothing)).toBe(1);
        expect(await world.run(raise)).toBe(2);
        expect(await world.run(idle)).toBe(3);
        expect(await reportOf(world, 2)).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        await world.run(listReports);
        expect(numbers).toEqual([]);
    });

    it("spawn a report for a run that failed or dropped commands, which an observer system sees in that run's pass", async () => {
        await using world = inline();
        logged.length = 0;
        world.add(logger);
        const failed = await world.run(fail);
        expect(logged).toEqual([[failed, ["run failed"]]]);
        const { failures } = await reportOf(world, failed);
        expect(failures.map(({ kind, name, message }) => [kind, name, message])).toEqual([["system", "reportsTest/fail", "run failed"]]);
        await world.run(spawn);
        const dropping = await world.run(despawnAll);
        expect(await reportOf(world, dropping)).toEqual({ failures: [], skipped: [], dropped: 1, warnings: [] });
        // A report of dropped commands alone has no failures to log.
        expect(logged).toHaveLength(2);
        await world.run(listReports);
        expect(numbers).toEqual([failed, dropping]);
        world.remove(logger);
    });

    it("add an observer pass's failures to its run's report, spawned for a clean run, which a logger sees at the next pass", async () => {
        await using world = inline();
        logged.length = 0;
        world.add(failingObserver);
        world.add(logger);
        const raised = await world.run(raise);
        expect(logged).toEqual([]);
        const { failures } = await reportOf(world, raised);
        expect(failures.map(({ name, message }) => [name, message])).toEqual([["reportsTest/failingObserver", "observer failed"]]);
        expect(logged).toEqual([[raised, ["observer failed"]]]);
        // A failed run's report gets its pass's failures after its own.
        const both = System.create([fail, raise]);
        const failed = await world.run(both);
        expect((await reportOf(world, failed)).failures.map(({ message }) => message)).toEqual(["run failed", "observer failed"]);
        expect(logged.slice(1)).toEqual([[failed, ["run failed"]], [failed, ["run failed", "observer failed"]]]);
    });

    it(`despawn reports ${retainedRuns} runs old, oldest first, as later runs pass them`, async () => {
        await using world = inline();
        const first = await world.run(fail);
        const second = await world.run(fail);
        // Up to the last run that keeps the first report, this listing's.
        while (await world.run(nothing) < first + retainedRuns - 2);
        await world.run(listReports);
        expect(numbers).toEqual([first, second]);
        // This run makes the first report too old, though the run itself is clean.
        await world.run(listReports);
        expect(numbers).toEqual([second]);
        const third = await world.run(fail);
        await world.run(listReports);
        expect(numbers).toEqual([third]);
    });

    it("number ticks with runs, apart from the clock's tick, and report a failing tick's systems", async () => {
        await using world = inline();
        logged.length = 0;
        world.add(logger);
        world.add(fail);
        let ticked = (): void => {};
        // Its first pass passes its filter; only a tick writes the clock after.
        let passes = 0;
        const watchTicks = System.create({ name: "reportsTest/watchTicks", observer: true, resources: { changed: [clock] } }, () => {
            if (++passes > 1) ticked();
        });
        world.add(watchTicks);
        const tick = new Promise<void>(resolve => { ticked = resolve; });
        const run = await world.run(nothing);
        await tick;
        const next = await world.run(nothing);
        expect(next).toBeGreaterThan(run + 1);
        const tickRuns = logged.map(([number]) => number).filter(number => number > run && number < next);
        expect(tickRuns.length).toBeGreaterThan(0);
        expect(logged.find(([number]) => number === tickRuns[0])?.[1]).toEqual(["run failed"]);
    });

    it("despawn each old report once, though their despawns wait for a later sync point", () => {
        const state = createState();
        const queued: CommandBuffer[] = [];
        let waiting = false;
        const reports = createReports(state, buffer => {
            if (waiting) queued.push(buffer);
            else synchronizeAlone(state, buffer);
        });
        const failed: RunReport = { failures: [{ kind: "system", name: "reportsTest/unit", message: "failed", stack: null }], skipped: [], dropped: 0, warnings: [] };
        reports.write(1, failed);
        reports.write(2, failed);
        // As while tails run: two reports, each making one older report too old, before either's commands apply.
        waiting = true;
        reports.write(1 + retainedRuns, failed);
        reports.write(2 + retainedRuns, failed);
        state.queued.push(...queued.map(buffer => ({ buffer, guarded: false })));
        expect(prepareSync(state, true)).toBe(true);
        // A despawn queued twice would drop the second.
        expect(state.plan.dropped).toBe(0);
        applySync(state);
    });
});
