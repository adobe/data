// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Report } from "../../interface/report/report.js";
import { retainedRuns } from "./reports.js";
import { System } from "../../interface/system/system.js";
import type { Input } from "../../interface/system/input.js";
import type { World } from "../../interface/world/world.js";

/** A run's report as data: its errors, empty when it has none, and what it dropped. */
export type Reported = {
    readonly failures: readonly Report.Failure[];
    readonly skipped: readonly string[];
    readonly dropped: number;
    readonly warnings: readonly Report.Warning[];
};

/** By world, its reader of reports and the reads asked of it, in the order their runs run: each the run whose report it wants, and what it found. */
type Reader = { readonly system: System; readonly asked: { readonly run: number; found: Reported | null; values: Report[typeof Report.run] | null }[] };
const readers = new WeakMap<World, Reader>();

const none: readonly never[] = [];

const readerOf = (world: World): Reader => {
    const known = readers.get(world);
    if (known !== undefined) return known;
    const asked: Reader["asked"] = [];
    const system = System.create({ name: "test/readReport", observer: true, components: { read: [Report.run] }, lookup: { errorsOf: { read: [Report.errors] } } }, (row, { lookup }) => {
        const read = asked[0];
        const values = row[Report.run];
        if (read === undefined || (read.run >= 0 ? values.number !== read.run : values.number <= (read.values?.number ?? -1))) return;
        const errors = lookup.errorsOf(row.entity)?.[Report.errors] ?? null;
        read.values = values;
        read.found = errors === null
            ? { failures: none, skipped: none, dropped: values.dropped, warnings: none }
            : { failures: errors.failures, skipped: errors.skipped, dropped: values.dropped, warnings: errors.warnings };
    });
    const reader = { system, asked };
    readers.set(world, reader);
    return reader;
};

const readOf = async (world: World, run: number) => {
    const { system, asked } = readerOf(world);
    const read: Reader["asked"][number] = { run, found: null, values: null };
    asked.push(read);
    try {
        await world.run(system);
    }
    finally {
        const left = asked.indexOf(read);
        if (left >= 0) asked.splice(left, 1);
    }
    return read;
};

/** Run `run`'s report, read once by an observer system's run over every report; throws when there's none. */
export const reportOf = async (world: World, run: number): Promise<Reported> => {
    const { found } = await readOf(world, run);
    if (found === null) throw new Error(`Run ${run} has no report.`);
    return found;
};

/** Run `run`'s `Report.run`; throws when it has no report. */
export const runOf = async (world: World, run: number): Promise<Report[typeof Report.run]> => {
    const { values } = await readOf(world, run);
    if (values === null) throw new Error(`Run ${run} has no report.`);
    return values;
};

/**
 * Runs a system, then reads the next run's report, which holds what the system's run found after its own was written:
 * what its observer pass threw.
 */
export const runThenNext = async <I>(world: World, system: System<I>, ...input: Input<NoInfer<I>>): Promise<Reported> => {
    await world.run(system, ...input);
    // The reader's own run is the newest: its report holds what was deferred to it.
    const { found } = await readOf(world, -1);
    if (found === null) throw new Error("The next run has no report.");
    return found;
};

/** Runs a system, then reads its run's report. */
export const runReported = async <I>(world: World, system: System<I>, ...input: Input<NoInfer<I>>): Promise<Reported> =>
    reportOf(world, await world.run(system, ...input));

/**
 * Follows a world's reports with an observer system it adds: `seen` lists each report as a pass found it changed, and
 * `until` resolves with the first one a test passes, once one does.
 */
export const followReports = (world: World) => {
    type Seen = { readonly run: number; readonly failures: readonly Report.Failure[] };
    const seen: Seen[] = [];
    const waiting: (() => void)[] = [];
    const system = System.create({ name: "test/followReports", observer: true, components: { read: [Report.run, Report.errors], changed: [Report.errors] } }, row => {
        seen.push({ run: row[Report.run].number, failures: row[Report.errors].failures });
        for (const wake of waiting.splice(0)) wake();
    });
    world.add(system);
    const until = async (test: (report: Seen) => boolean): Promise<Seen> => {
        for (;;) {
            const found = seen.find(test);
            if (found !== undefined) return found;
            await new Promise<void>(resolve => waiting.push(resolve));
        }
    };
    return { seen, until, stop: () => world.remove(system) };
};

/** Despawns every report, for tests that compare entity order with a world that has none: later runs spawn them again. */
export const dropReports = System.create({ name: "test/dropReports", components: { has: [Report.run] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});

const nothing = System.create({ name: "test/nothing" }, () => {});

/** Runs a world until every report it keeps is spawned, so later runs reuse their entities and spawn none. */
export const fillReports = async (world: World): Promise<void> => {
    for (let k = 0; k < retainedRuns; k++) await world.run(nothing);
};
