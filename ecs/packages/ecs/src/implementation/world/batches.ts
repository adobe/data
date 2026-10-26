// © 2026 Adobe. MIT License. See /LICENSE for details.
import { ensureCapacity, noShared, type Archetype } from './archetype.js';
import type { CommandBuffer } from './buffer.js';
import { indexOf } from './entities.js';
import { blockShift, chunkShift } from './kernel.js';
import { createBatch, type SpawnBatch } from './staging.js';
import { archetypeOf, type State } from './state.js';
import { gainsOf } from './structure.js';
import { remoteError } from './remote.js';
import { countChanged } from './layout-directory.js';
import { logRange, logSet, startTag, tagOf } from './move-log.js';
import { writeDefault } from './synchronize.js';
import { writeString } from './strings.js';
import { cacheShared, internShared } from './shared.js';

/** Batches of at most this many rows commit element by element. */
const smallCopy = 8;

/**
 * The batch of main-thread spawns of exactly these components, with these shared values by component id, made on first
 * use.
 */
export const batchOf = (state: State, ids: readonly number[], shared: readonly (number | undefined)[] = noShared): SpawnBatch => {
    const sorted = [...ids].sort((a, b) => a - b);
    const key = shared === noShared ? sorted.join(",") : keyOf(sorted, shared);
    let batch = state.batchByKey.get(key);
    if (batch === undefined) {
        batch = createBatch(state.layouts, ids, shared);
        for (const column of batch.columns) if (state.remote[column.id] !== undefined) column.remote = remoteError(state, column.id).message;
        state.batchByKey.set(key, batch);
        state.batches.push(batch);
        if (shared !== noShared) letGoWith(state, batch, key);
    }
    return batch;
};

/** A batch's key: its sorted component ids, each shared one with the number of its value. */
const keyOf = (sorted: readonly number[], shared: readonly (number | undefined)[]): string =>
    sorted.map(id => shared[id] === undefined ? `${id}` : `${id}=${shared[id]}`).join(",");

/**
 * Lets go of a batch of shared values, keyed `key`, once any of them is dropped, so batches don't pile up as values
 * come and go. A spawner still holding it revives it as it next spawns: its values are interned again and it's listed
 * once more, with numbers that may be new.
 */
const letGoWith = (state: State, batch: SpawnBatch, key: string): void => {
    const held = batch.ids.flatMap(id => {
        const number = batch.shared[id];
        const values = state.shared[id];
        return number === undefined || values === undefined ? [] : [{ id, values, value: values.values[number], number }];
    });
    const unregister: (() => void)[] = [];
    const drop = (): void => {
        for (const letGo of unregister) letGo();
        if (state.batchByKey.get(key) === batch) state.batchByKey.delete(key);
        const at = state.batches.indexOf(batch);
        if (at >= 0) state.batches.splice(at, 1);
        batch.archetype = null;
        batch.capacity = batch.count;
        batch.revive = () => {
            const shared: (number | undefined)[] = [];
            for (const { id, values, value } of held) shared[id] = internShared(values, value);
            batch.shared = shared;
            batch.capacity = batch.entities.length;
            const again = keyOf(batch.ids, shared);
            if (!state.batchByKey.has(again)) state.batchByKey.set(again, batch);
            state.batches.push(batch);
            letGoWith(state, batch, again);
        };
    };
    for (const { values, number } of held) unregister.push(cacheShared(values, number, drop));
};

/**
 * A batch's archetype, found the first time it commits, and again once it was reclaimed or reused for other values
 * (`reclaim.ts`), which its generation tells.
 */
const archetypeOfBatch = (state: State, batch: SpawnBatch): Archetype => {
    const known = batch.archetype;
    if (known !== null && !known.reclaimed && known.generation === batch.generation) return known;
    const archetype = archetypeOf(state, batch.ids, batch.shared);
    batch.archetype = archetype;
    batch.generation = archetype.generation;
    return archetype;
};

/**
 * Copies rows `first` to `first + n` of a batch into its archetype, or into its closure under `close` when rules or
 * `within` apply, places their entities, writes the defaults of derived components the target gains, and stamps their
 * ticks with the sync point's tick, as a commanded spawn would be. `born` records the first row each target gains.
 */
const commitRows = (state: State, batch: SpawnBatch, first: number, n: number, tick: number, born: Map<number, number>, close: ((archetype: Archetype) => Archetype) | null): void => {
    const spawned = archetypeOfBatch(state, batch);
    const target = close === null ? spawned : close(spawned);
    ensureCapacity(state.memory, target, target.count + n);
    const start = target.count;
    if (!born.has(target.id)) born.set(target.id, start);
    if (close !== null) {
        for (const id of gainsOf(state.structure, state.derived, null, target)) {
            const storage = target.storageById[id];
            if (storage !== undefined) for (let row = start; row < start + n; row++) writeDefault(state, storage, row, tick);
        }
    }
    // A few rows copy element by element: a subarray to copy from costs more than they do.
    if (n <= smallCopy) for (let i = 0; i < n; i++) target.entities[start + i] = batch.entities[first + i];
    else target.entities.set(batch.entities.subarray(first, first + n), start);
    if (target.logs !== null) for (const log of target.logs) logRange(log, target.id, start, n, batch.entities, first);
    if (state.counting) countChanged(state.counted, target);
    for (const column of batch.columns) {
        const storage = target.storageById[column.id];
        if (storage === undefined) continue;
        if (column.layout.kind === "linear") {
            const bytes = n * column.stride;
            const from = first * column.stride;
            const offset = start * column.stride;
            if (n <= smallCopy) for (let i = 0; i < bytes; i++) storage.views.u8[offset + i] = column.views.u8[from + i];
            else storage.views.u8.set(column.views.u8.subarray(from, from + bytes), offset);
        }
        else if (column.layout.kind === "object") {
            if (storage.remote === null) for (let i = 0; i < n; i++) storage.values[start + i] = column.values[first + i];
            else {
                // A joined thread's objects start at their starts there, as the rows' range says: a tag set otherwise.
                const log = storage.remote;
                const begin = log.starts[column.id];
                for (let i = 0; i < n; i++) {
                    const tag = Math.max(startTag, tagOf(column.values[first + i], begin));
                    storage.tags[start + i] = tag;
                    if (tag !== startTag) logSet(log, target.id, start + i, column.id, tag, true);
                }
            }
            column.values.fill(undefined, first, first + n);
        }
        // Rows past the count hold no record, so nothing is let go.
        else if (column.layout.kind === "string") {
            for (let i = 0; i < n; i++) writeString(storage, start + i, column.values[first + i]);
            column.values.fill(undefined, first, first + n);
        }
        if (!storage.ticked) continue;
        storage.added.fill(tick, start, start + n);
        if (storage.changed !== storage.added) storage.changed.fill(tick, start, start + n);
        // Ticks only increase, so the newest tick in each chunk and block the rows reach is this one.
        storage.blockAdded.fill(tick, start >> blockShift, ((start + n - 1) >> blockShift) + 1);
        if (storage.blockChanged !== storage.blockAdded) storage.blockChanged.fill(tick, start >> blockShift, ((start + n - 1) >> blockShift) + 1);
        storage.chunkAdded.fill(tick, start >> chunkShift, ((start + n - 1) >> chunkShift) + 1);
        if (storage.chunkChanged !== storage.chunkAdded) storage.chunkChanged.fill(tick, start >> chunkShift, ((start + n - 1) >> chunkShift) + 1);
    }
    const { entities } = state;
    for (let i = 0; i < n; i++) {
        const index = indexOf(batch.entities[first + i]);
        entities.archetype[index] = target.id;
        entities.row[index] = start + i;
    }
    target.count += n;
    state.touched?.add(target);
};

/** At a sync point, before the plan: commits and empties every main-thread batch. Returns the entities committed. */
export const commitBatches = (state: State, tick: number, born: Map<number, number>, close: ((archetype: Archetype) => Archetype) | null): number => {
    let committed = 0;
    for (const batch of state.batches) {
        const n = batch.count;
        if (n === 0) continue;
        commitRows(state, batch, 0, n, tick, born, close);
        batch.count = 0;
        committed += n;
    }
    return committed;
};

/**
 * Then, in merge order, the kernel spawns each queued buffer staged; their runner or worker empties the batches before
 * staging into them again. Returns the entities committed.
 */
export const commitStaged = (state: State, queued: readonly { readonly buffer: CommandBuffer }[], tick: number, born: Map<number, number>, close: ((archetype: Archetype) => Archetype) | null): number => {
    let committed = 0;
    for (let b = 0; b < queued.length; b++) {
        const { buffer } = queued[b];
        for (let s = 0; s < buffer.stagedCount; s++) {
            const { batch, start, end } = buffer.staged[s];
            commitRows(state, batch, start, end - start, tick, born, close);
            committed += end - start;
        }
    }
    return committed;
};
