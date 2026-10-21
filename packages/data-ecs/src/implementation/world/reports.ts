import type { Failure } from '../../interface/report/failure.js';
import { Report } from '../../interface/report/report.js';
import { createBuffer, despawnCommand, pushCommand, spawnCommand, addCommand, type CommandBuffer } from './buffer.js';
import { pushValues } from './commands.js';
import { locate, reserve } from './entities.js';
import type { RunReport } from './failures.js';
import type { State } from './state.js';

/** How many runs a report is kept for: once a run's number is this much past a report's, that report is despawned. */
export const retainedRuns = 256;

/** Whether a run has nothing to report. */
export const isClean = (report: RunReport): boolean =>
    report.failures.length === 0 && report.skipped.length === 0 && report.dropped === 0 && report.warnings.length === 0;

const none: readonly never[] = [];

/**
 * The world's reports, as entities: each spawned by the commands `apply` takes, which the world applies as a sync point
 * of the report's own after its run's, or in the next one, so `changed` filters see it; those `retainedRuns` older are
 * despawned with it, oldest first. Clean runs spawn nothing; `due` tells, with one comparison, when one has a report
 * to despawn. The world keeps the reports it spawned in run order, which finds the old ones without the index
 * `Report.byRun` a lookup would build each time (perf.md, "Tried and not kept").
 */
export const createReports = (state: State, apply: (buffer: CommandBuffer) => void) => {
    /** The run at which the oldest report is due to be despawned; Infinity with none. */
    let retireAt = Infinity;
    /** The reports spawned and not yet despawned, by run number and entity, in run order. */
    const spawnedRuns: number[] = [];
    const spawnedEntities: number[] = [];
    /** The last report spawned, which failures found after it are added to. */
    let last: { run: number; entity: number; failures: readonly Failure[] } | null = null;

    /**
     * Despawns, into `buffer`, the reports older than `run` by `retainedRuns` or more that are still alive, and moves
     * `retireAt` to the oldest one left or `spawned`, a run whose report the same sync point spawns.
     */
    const retire = (buffer: CommandBuffer, run: number, spawned: number): void => {
        let k = 0;
        while (k < spawnedRuns.length && spawnedRuns[k] <= run - retainedRuns) {
            if (locate(state.entities, spawnedEntities[k]) >= 0) pushCommand(buffer, despawnCommand, spawnedEntities[k]);
            k++;
        }
        spawnedRuns.splice(0, k);
        spawnedEntities.splice(0, k);
        retireAt = Math.min(spawnedRuns.length === 0 ? Infinity : spawnedRuns[0], spawned) + retainedRuns;
    };

    /** Spawns run `run`'s report with `values`, retiring older ones in the same sync point. */
    const spawn = (run: number, report: RunReport): void => {
        const buffer = createBuffer();
        const entity = reserve(state.entities);
        pushValues(state, buffer, spawnCommand, entity, {
            [Report.run]: run, [Report.failures]: report.failures, [Report.skipped]: report.skipped, [Report.dropped]: report.dropped, [Report.warnings]: report.warnings,
        });
        if (run >= retireAt) retire(buffer, run, run);
        else retireAt = Math.min(retireAt, run + retainedRuns);
        apply(buffer);
        last = { run, entity, failures: report.failures };
        let at = spawnedRuns.length;
        while (at > 0 && spawnedRuns[at - 1] > run) at--;
        spawnedRuns.splice(at, 0, run);
        spawnedEntities.splice(at, 0, entity);
    };

    return {
        /** Whether a clean run `run` has older reports to despawn. */
        due: (run: number): boolean => run >= retireAt,
        /** Spawns the report of run `run`, which isn't clean. */
        write: spawn,
        /** Despawns, as a sync point of its own, the reports run `run` makes too old. */
        retire: (run: number): void => {
            const buffer = createBuffer();
            retire(buffer, run, Infinity);
            apply(buffer);
        },
        /** Adds failures found after run `run`'s report was written, stamped, spawning it if the run was clean. */
        amend: (run: number, failures: readonly Failure[]): void => {
            if (last === null || last.run !== run) {
                spawn(run, { failures, skipped: none, dropped: 0, warnings: none });
                return;
            }
            const buffer = createBuffer();
            const all = [...last.failures, ...failures];
            pushValues(state, buffer, addCommand, last.entity, { [Report.failures]: all });
            apply(buffer);
            last.failures = all;
        },
    };
};

export type Reports = ReturnType<typeof createReports>;
