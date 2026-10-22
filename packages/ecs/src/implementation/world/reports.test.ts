// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Component, Index, Report, Resource, System, clock, workers } from "../../index.js";
import { createWorld } from "./create.js";
import { retainedRuns } from "./reports.js";
import { reportOf, runOf } from "./reports.test-helper.js";

const amount = Symbol("reportsTest/amount");
const level = Symbol("reportsTest/level");
declare module "@adobe/ecs" {
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
const logger = System.create({ name: "reportsTest/logger", observer: true, components: { read: [Report.run, Report.errors], changed: [Report.errors] } }, row => {
    logged.push([row[Report.run].number, row[Report.errors].failures.map(failure => failure.message)]);
});

/** The run numbers of every report, in entity order, and of those with errors. */
let numbers: number[] = [];
let withErrors: number[] = [];
const allReports = Index.create({ name: "reportsTest/allReports", key: [], components: { has: [Report.run] } });
const erredReports = Index.create({ name: "reportsTest/erredReports", key: [], components: { has: [Report.run, Report.errors] } });
const listReports = System.create({ name: "reportsTest/listReports", observer: true, lookup: { all: { index: allReports, read: [Report.run] }, erred: { index: erredReports, read: [Report.run] } } }, ({ lookup }) => {
    const all = lookup.all();
    numbers = [];
    for (let i = 0; i < all.length; i++) numbers.push(all.at(i)[Report.run].number);
    const erred = lookup.erred();
    withErrors = [];
    for (let i = 0; i < erred.length; i++) withErrors.push(erred.at(i)[Report.run].number);
});

const inline = () => createWorld({ [workers]: 0 });
const sorted = (values: readonly number[]) => [...values].sort((a, b) => a - b);

describe("reports", () => {
    it("number every run in order, one of observer systems alone included, each with a report", async () => {
        await using world = inline();
        expect(await world.run(nothing)).toBe(1);
        expect(await world.run(raise)).toBe(2);
        expect(await world.run(idle)).toBe(3);
        expect(await reportOf(world, 2)).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        const listed = await world.run(listReports);
        expect(sorted(numbers)).toEqual([1, 2, 3, 4, listed]);
        expect(withErrors).toEqual([]);
    });

    it("say what a run ran: its systems, on main with no joined thread claiming it, and how long it took", async () => {
        await using world = inline();
        const both = await world.run(System.create([nothing, raise]));
        const values = await runOf(world, both);
        expect({ ...values, elapsed: 0 }).toEqual({ number: both, elapsed: 0, systems: 2, workers: 0, joined: 0, main: true, gpu: false, dropped: 0 });
        expect(values.elapsed).toBeGreaterThanOrEqual(0);
        const alone = await runOf(world, await world.run(idle));
        expect({ ...alone, elapsed: 0 }).toEqual({ number: alone.number, elapsed: 0, systems: 0, workers: 0, joined: 0, main: false, gpu: false, dropped: 0 });
    });

    it("give a failed run errors, which an observer system sees in that run's pass, and a dropping run only its count", async () => {
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
        expect(logged).toHaveLength(1);
        await world.run(listReports);
        expect(withErrors).toEqual([failed]);
        world.remove(logger);
    });

    it("write each report's errors once, an observer pass's failures in the next run's report", async () => {
        await using world = inline();
        logged.length = 0;
        world.add(failingObserver);
        world.add(logger);
        const raised = await world.run(raise);
        expect(logged).toEqual([]);
        expect((await reportOf(world, raised)).failures).toEqual([]);
        // The reader's run, the next, holds them, and the logger saw them in its pass.
        const { failures } = await reportOf(world, raised + 1);
        expect(failures.map(({ name, message }) => [name, message])).toEqual([["reportsTest/failingObserver", "observer failed"]]);
        expect(logged).toEqual([[raised + 1, ["observer failed"]]]);
        // A failed run's report holds its own failures; its pass's are in the next.
        const both = System.create([fail, raise]);
        const failed = await world.run(both);
        expect((await reportOf(world, failed)).failures.map(({ message }) => message)).toEqual(["run failed"]);
        expect((await reportOf(world, failed + 1)).failures.map(({ message }) => message)).toEqual(["observer failed"]);
        expect(logged.slice(1)).toEqual([[failed, ["run failed"]], [failed + 1, ["observer failed"]]]);
    });

    it(`keep the last ${retainedRuns} runs' reports, a later run taking the oldest one's entity and dropping its errors`, async () => {
        await using world = inline();
        const first = await world.run(fail);
        const second = await world.run(fail);
        while (await world.run(nothing) < first + retainedRuns - 2);
        await world.run(listReports);
        expect(numbers).toHaveLength(retainedRuns);
        expect(sorted(withErrors)).toEqual([first, second]);
        // This run takes the first report's entity, and its errors go.
        const next = await world.run(listReports);
        expect(numbers).toHaveLength(retainedRuns);
        expect(sorted(numbers)[0]).toBe(second);
        expect(sorted(numbers).at(-1)).toBe(next);
        expect(withErrors).toEqual([second]);
    });

    it("write a reused report's errors in place when its run has errors too, and a logger sees each run's own", async () => {
        await using world = inline();
        logged.length = 0;
        world.add(logger);
        const failWith = System.create({ name: "reportsTest/failWith", input: { type: "object", properties: { k: { type: "integer" } } } }, ({ input }) => { throw new Error(`run ${input.k}`); });
        for (let k = 0; k < retainedRuns; k++) await world.run(failWith, { k });
        logged.length = 0;
        const reused = await world.run(failWith, { k: retainedRuns });
        expect(logged).toEqual([[reused, [`run ${retainedRuns}`]]]);
        expect((await reportOf(world, reused)).failures.map(({ message }) => message)).toEqual([`run ${retainedRuns}`]);
        await world.run(listReports);
        expect(numbers).toHaveLength(retainedRuns);
        world.remove(logger);
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
});
