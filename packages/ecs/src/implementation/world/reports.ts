import { Report } from '../../interface/report/report.js';
import type { Failure, Warning } from '../../interface/report/failure.js';
import { stampChanged } from './archetype.js';
import { addCommand, createBuffer, pushCommand, pushComponent, removeCommand, spawnCommand, type CommandBuffer } from './buffer.js';
import { writeCell } from './cells.js';
import type { Views } from '../../interface/registry/layout.js';
import { pushValues } from './commands.js';
import { locate, reserve } from './entities.js';
import type { RunReport } from './failures.js';
import { idOf, type State } from './state.js';

/** How many runs keep their reports: past that, each run's report reuses the oldest one's entity. */
export const retainedRuns = 256;

/** What a run reports in `Report.run`. */
export type RunValues = {
    number: number;
    elapsed: number;
    systems: number;
    workers: number;
    joined: number;
    main: boolean;
    gpu: boolean;
    dropped: number;
};

type Errors = { readonly failures: readonly Failure[]; readonly skipped: readonly string[]; readonly warnings: readonly Warning[] };

/**
 * A report entity, of the run that last took it. `errors` is what its `Report.errors` holds, or will once commands
 * queued for it apply; null without. `own` tells whether those are its run's, not an earlier run's it reuses.
 */
export type Slot = { entity: number; run: number; errors: Errors | null; own: boolean };

/** Whether a run has nothing for `Report.errors`. */
export const isClean = (report: RunReport): boolean => report.failures.length === 0 && report.skipped.length === 0 && report.warnings.length === 0;

const none: readonly never[] = [];
const noErrors: Errors = { failures: none, skipped: none, warnings: none };

/** Fields of `Report.run`, in no particular order: what `createRunWriter` writes. */
const runFields = ["number", "elapsed", "systems", "workers", "joined", "main", "gpu", "dropped"] as const satisfies readonly (keyof RunValues)[];

/** A writer of `RunValues` into a storage of `Report.run`, by the leaf of each field in `layout`. */
const createRunWriter = (layout: State["layouts"][number]) => {
    if (layout.kind !== "linear") throw new Error("Report.run isn't a struct.");
    const leafOf = (field: string) => {
        const leaf = layout.leaves.find(each => each.path[0] === field);
        if (leaf === undefined) throw new Error(`Report.run has no ${field}.`);
        return leaf;
    };
    const [number, elapsed, systems, workers, joined, main, gpu, dropped] = runFields.map(leafOf);
    return (views: Views, row: number, values: RunValues): void => {
        views[number.view][row * number.unitStride + number.unitOffset] = values.number;
        views[elapsed.view][row * elapsed.unitStride + elapsed.unitOffset] = values.elapsed;
        views[systems.view][row * systems.unitStride + systems.unitOffset] = values.systems;
        views[workers.view][row * workers.unitStride + workers.unitOffset] = values.workers;
        views[joined.view][row * joined.unitStride + joined.unitOffset] = values.joined;
        views[main.view][row * main.unitStride + main.unitOffset] = values.main ? 1 : 0;
        views[gpu.view][row * gpu.unitStride + gpu.unitOffset] = values.gpu ? 1 : 0;
        views[dropped.view][row * dropped.unitStride + dropped.unitOffset] = values.dropped;
    };
};

/**
 * The world's reports: an entity for each of the last `retainedRuns` runs and ticks. Each run takes one as it starts:
 * a new one, spawned by its own sync point, until that many are, then the oldest. Once its sync point is done, its
 * `Report.run` is written in place, stamped so `changed` filters see it. `Report.errors` is written in place too when
 * the entity holds it already, so a reused entity changes archetype only when its run's errors come or go; adding or
 * removing it joins the run's sync point when known before it, else applies with `applyAlone`.
 */
export const createReports = (state: State, applyAlone: (buffer: CommandBuffer) => Promise<void> | null) => {
    const runId = idOf(state, Report.run);
    const errorsId = idOf(state, Report.errors);
    state.meta.add(runId).add(errorsId);
    const slots: Slot[] = [];
    /** The slot the next run takes once every one is spawned. */
    let oldest = 0;
    /** The slot the last run took. */
    let last: Slot | null = null;

    /** The storage and row of a slot's component `id`, while its entity holds it. */
    const cellOf = (slot: Slot, id: number) => {
        const index = locate(state.entities, slot.entity);
        if (index < 0) return null;
        const storage = state.archetypes[state.entities.archetype[index]]?.storageById[id];
        return storage === undefined ? null : { storage, row: state.entities.row[index] };
    };

    /** Writes `Report.run` field by field through its layout's leaves, without the general writer's walk. */
    const writeRun = createRunWriter(state.layouts[runId]);

    /** Writes `errors` into a slot: in place when its entity holds them, stamped; else by an add, queued or alone. */
    const putErrors = (slot: Slot, errors: Errors, queue: boolean): Promise<void> | null => {
        const pending = slot.errors !== null && cellOf(slot, errorsId) === null;
        slot.errors = errors;
        slot.own = true;
        const cell = cellOf(slot, errorsId);
        if (cell !== null) {
            writeCell(cell.storage, cell.row, errors);
            stampChanged(cell.storage, cell.row, ++state.tick);
            return null;
        }
        const buffer = createBuffer();
        pushValues(state, buffer, addCommand, slot.entity, { [Report.errors]: errors });
        if (queue || pending) {
            state.queued.push({ buffer, guarded: false });
            return null;
        }
        return applyAlone(buffer);
    };

    /**
     * Takes run `run`'s slot: a new entity, spawned by commands queued for the next sync point, until every one is,
     * then the oldest, or a new one in its place when a system despawned it.
     */
    const take = (run: number): Slot => {
        let slot: Slot;
        if (slots.length < retainedRuns) {
            slot = { entity: -1, run, errors: null, own: false };
            slots.push(slot);
        }
        else {
            slot = slots[oldest];
            oldest = (oldest + 1) % retainedRuns;
            slot.run = run;
            slot.own = false;
            if (locate(state.entities, slot.entity) >= 0) return last = slot;
            slot.errors = null;
        }
        slot.entity = reserve(state.entities);
        const buffer = createBuffer();
        pushValues(state, buffer, spawnCommand, slot.entity, {
            [Report.run]: { number: run, elapsed: 0, systems: 0, workers: 0, joined: 0, main: false, gpu: false, dropped: 0 } satisfies RunValues,
        });
        state.queued.push({ buffer, guarded: false });
        return last = slot;
    };

    return {
        /** The slot the last run took. */
        lastSlot: (): Slot => {
            if (last === null) throw new Error("No run took a report yet.");
            return last;
        },
        /** Takes the report of run `run`, which is about to run: what that takes joins the run's own sync point. */
        begin: take,
        /** Takes run `run`'s report between runs: what that takes applies as a sync point of its own. */
        beginAlone: (run: number): Slot | Promise<Slot> => {
            const queued = state.queued.length;
            const slot = take(run);
            if (state.queued.length === queued) return slot;
            const applying = applyAlone(state.queued.splice(queued, 1)[0].buffer);
            return applying === null ? slot : applying.then(() => slot);
        },
        /**
         * Puts, for the run that took the last slot, `Report.errors` for what went wrong before its sync point:
         * failures, skipped systems and the first `warningCount` warnings, copied, since the run's lists grow.
         */
        beforeSync: (failures: readonly Failure[] | null, skipped: readonly string[] | null, warnings: readonly Warning[], warningCount: number): void => {
            if (last === null || (failures === null && skipped === null && warningCount === 0)) return;
            const errors = { failures: failures === null ? none : failures.slice(), skipped: skipped === null ? none : skipped.slice(), warnings: warningCount === 0 ? none : warnings.slice(0, warningCount) };
            void putErrors(last, errors, true);
        },
        /**
         * Writes run `run`'s report into its slot once its sync point is done: `Report.run`, then its errors unless
         * they were put before it, or clears those an earlier run left. A report's errors are written once: failures
         * found after go to `defer`, for the next report. While tails run on joined threads, a removal waits for the
         * next sync point, the errors emptied meanwhile.
         */
        finish: (slot: Slot, values: RunValues, report: RunReport, tailsRun: boolean, defer: (failures: readonly Failure[]) => void): Promise<void> | null => {
            if (slot.run !== values.number) return null;
            const cell = cellOf(slot, runId);
            if (cell === null) return null;
            writeRun(cell.storage.views, cell.row, values);
            stampChanged(cell.storage, cell.row, ++state.tick);
            if (!isClean(report)) {
                const given = slot.own ? slot.errors : null;
                if (given === null) return putErrors(slot, { failures: report.failures, skipped: report.skipped, warnings: report.warnings }, tailsRun);
                // Its errors are written once: failures found since go to the next report.
                if (report.failures.length > given.failures.length) defer(report.failures.slice(given.failures.length));
                return null;
            }
            if (slot.errors === null || slot.own) return null;
            const held = cellOf(slot, errorsId);
            if (held !== null) {
                writeCell(held.storage, held.row, noErrors);
                stampChanged(held.storage, held.row, ++state.tick);
            }
            slot.errors = null;
            const buffer = createBuffer();
            pushCommand(buffer, removeCommand, slot.entity);
            pushComponent(buffer, errorsId, undefined);
            if (tailsRun) {
                state.queued.push({ buffer, guarded: false });
                return null;
            }
            return applyAlone(buffer);
        },
    };
};

export type Reports = ReturnType<typeof createReports>;
