import { Report } from "../../interface/report/report.js";
import { System } from "../../interface/system/system.js";
import type { Input } from "../../interface/system/input.js";
import type { World } from "../../interface/world/world.js";

/** A run's report as data, or empty lists and a zero for a clean run, which has none. */
export type Reported = {
    readonly failures: readonly Report.Failure[];
    readonly skipped: readonly string[];
    readonly dropped: number;
    readonly warnings: readonly Report.Warning[];
};

const clean: Reported = { failures: [], skipped: [], dropped: 0, warnings: [] };

/** By world, its reader of reports and the reads asked of it, in the order their runs run: each the run whose report it wants, and what it found. */
type Reader = { readonly system: System; readonly asked: { readonly run: number; found: Reported }[] };
const readers = new WeakMap<World, Reader>();

const readerOf = (world: World): Reader => {
    const known = readers.get(world);
    if (known !== undefined) return known;
    const asked: Reader["asked"] = [];
    const system = System.create({ name: "test/readReport", observer: true, lookup: { reports: { index: Report.byRun, read: Report.Archetype } } }, ({ lookup }) => {
        const read = asked.shift();
        if (read === undefined) return;
        const row = lookup.reports(read.run);
        read.found = row === null ? clean : { failures: row[Report.failures], skipped: row[Report.skipped], dropped: row[Report.dropped], warnings: row[Report.warnings] };
    });
    const reader = { system, asked };
    readers.set(world, reader);
    return reader;
};

/** Run `run`'s report, read once by an observer system's run through `Report.byRun`. */
export const reportOf = async (world: World, run: number): Promise<Reported> => {
    const { system, asked } = readerOf(world);
    const read = { run, found: clean };
    asked.push(read);
    try {
        await world.run(system);
    }
    finally {
        const left = asked.indexOf(read);
        if (left >= 0) asked.splice(left, 1);
    }
    return read.found;
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
    const system = System.create({ name: "test/followReports", observer: true, components: { read: [Report.run, Report.failures], changed: [Report.failures] } }, row => {
        seen.push({ run: row[Report.run], failures: row[Report.failures] });
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

/**
 * Despawns every report. A run warned of a blocking tier spawns one, which takes the index a despawn freed; tests that
 * compare entity order with a world that spawned none drop them first.
 */
export const dropReports = System.create({ name: "test/dropReports", components: { has: [Report.run] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});
