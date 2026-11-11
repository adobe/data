// © 2026 Adobe. MIT License. See /LICENSE for details.
import { chunkShift } from './kernel.js';
import type { SyncSystemRunner } from './sync-systems.js';
import type { State } from './state.js';

const none: readonly number[] = [];

/**
 * Follows, from the next run, the rows written of each component an active changes system watches: its ticks and
 * kernels' chunk stamps start then and are kept for the world's life, as sync systems' index watches are; kernels keep
 * no row or block stamps for it, which only change filters read. Tests the ids the
 * world met since it last did against every changes system, and every id against those just activated.
 */
export const followRows = (state: State, activated: Iterable<SyncSystemRunner>): void => {
    const tested = state.rowsTested;
    for (const runner of activated) if (runner.syncSystem.kind === "changes") for (let id = 0; id < tested; id++) followRow(state, runner, id);
    const met = state.keys.length;
    if (met === tested) return;
    for (const runner of state.syncSystems) if (runner.syncSystem.kind === "changes") for (let id = tested; id < met; id++) followRow(state, runner, id);
    state.rowsTested = met;
};

const followRow = (state: State, runner: SyncSystemRunner, id: number): void => {
    if (state.rowsFollowed[id] === true || state.resources.has(id) || !runner.watches(id)) return;
    state.rowsFollowed[id] = true;
    state.rowsWatched.push(id);
    // Stamps from before it's followed aren't writes it's told of.
    state.rowsStarted[id] = state.tick;
    state.rowsPending.push(id);
};

/** Once changes systems were released: rows written are due only for components one still active watches. */
export const unfollowRows = (state: State): void => {
    const watching = state.syncSystems.filter(runner => runner.syncSystem.kind === "changes");
    const kept = state.rowsWatched.filter(id => watching.some(runner => runner.watches(id)));
    state.rowsWatched.splice(0, state.rowsWatched.length, ...kept);
};

/**
 * Whether a system wrote component `id` through a row after `since`: first by the tick of the last system run that
 * wrote it, then by its chunks' and its columns' change ticks in each archetype holding it, so a system that may write
 * it and didn't counts nothing, and a sync point that finds nothing scans no rows.
 */
const writtenSince = (state: State, id: number, since: number): boolean => {
    if (state.written[id] <= since) return false;
    const { archetypes } = state;
    for (let k = 0; k < archetypes.length; k++) {
        const archetype = archetypes[k];
        if (archetype.count === 0 || archetype.resource) continue;
        const storage = archetype.storageById[id];
        if (storage === undefined || !storage.ticked) continue;
        if (storage.columnChanged > since) return true;
        const chunks = storage.chunkChanged;
        for (let chunk = 0, last = (archetype.count - 1) >> chunkShift; chunk <= last; chunk++) if (chunks[chunk] > since) return true;
    }
    return false;
};

/** Since when component `id`'s writes are news to changes systems. */
const sinceOf = (state: State, id: number): number => Math.max(state.rowsSeen, state.rowsStarted[id]);

/** Whether a component changes systems watch was written through a row since they last ran, so a sync point is due for them. */
export const rowsWritten = (state: State): boolean => {
    const { rowsWatched } = state;
    for (let k = 0; k < rowsWatched.length; k++) if (writtenSince(state, rowsWatched[k], sinceOf(state, rowsWatched[k]))) return true;
    return false;
};

/** The components changes systems watch written through rows since they last ran, which they see as of `tick` from now on. */
export const takeRowsWritten = (state: State, tick: number): readonly number[] => {
    let written: number[] | null = null;
    for (const id of state.rowsWatched) if (writtenSince(state, id, sinceOf(state, id))) (written ??= []).push(id);
    state.rowsSeen = tick;
    return written ?? none;
};
