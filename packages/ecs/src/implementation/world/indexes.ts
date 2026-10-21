import type { IndexDefinition } from '../../interface/registry/index.js';
import { indexDefinitionOf, indexOfLookup, labelOfItem, watchedBy, watchesEntries } from '../../interface/registry/index.js';
import type { Failure } from '../../interface/report/failure.js';
import type { SystemLookup } from '../../interface/system/access.js';
import type { Archetype, Storage } from './archetype.js';
import { readCell } from './cells.js';
import { chunkShift } from './kernel.js';
import { journalEnd } from './journal.js';
import { encodeStored, hashWords, keyPartsOf, missing, release as releaseInterned, retain, type KeyPart } from './index-keys.js';
import {
    bucketFor, coverBuckets, coverEntities, createHashTable, entryWords, insertEntry, lengthOf, loadHashTable, mergeEntries, place, placeAll, recordHash,
    recordKey, rehash, relocate, slotsHold, releaseHashTable, removeEntry, startOf, tidyHashTable, unwatchHashComponent, watchHashComponent, type HashTable,
} from './index-hash.js';
import { allocateArray, freeArray } from './arrays.js';
import { buildKernel, buildViews, maximumPartitions, phases, pieceEntities, planWords, runBuildStep, scalarCodes, writePlan, type BuildViews, type HashBuild, type Phase } from './index-build.js';
import type { Pool } from './pool.js';
import { idOf, observe, startTicking, type State } from './state.js';
import {
    blockBase, blockEntries, coverSortedEntities, createSortedTable, entryOf, insertSorted, loadSortedTable, refreshWatchedTree, relocateSorted,
    releaseSortedTable, removeSorted, sameStoredKey, stampWatched, unwatchSortedComponent, watchSortedComponent, type SortedTable,
} from './index-sorted.js';
import { compareObjects, keptSorted } from './index-keys.js';

/**
 * What a world keeps of an index while some registered system or finalizer of it uses one: its structure, which
 * archetypes it holds the entities of, how far it read the journal and the ticks of its key, and, by component its
 * lookups watch, how far it read that component's ticks.
 */
export type WorldIndex = {
    readonly definition: IndexDefinition;
    readonly label: string;
    /** Runners and finalizers using it: it's released when the last one is. */
    users: number;
    readonly keys: readonly number[];
    readonly has: readonly number[];
    readonly not: readonly number[];
    readonly parts: readonly KeyPart[];
    /** Whether a part holds objects, whose values the index interns. */
    readonly objects: boolean;
    readonly words: number;
    readonly unique: boolean;
    /** By archetype id: 1 when it holds that archetype's entities, 2 when not, 0 until checked; and those it holds. */
    member: Int8Array;
    readonly members: Archetype[];
    /** The journal position it read up to, or -1 before it's built; the tick it was last refreshed at. */
    position: number;
    refreshed: number;
    /**
     * The tick of the last refresh at which an entity entered or left it or moved to another key or position in it, or
     * it was built; 0 before.
     */
    changed: number;
    /** By watched component: how many lookups watch it, and the tick its ticks were read up to. */
    readonly watchers: Map<number, number>;
    readonly scanned: Map<number, number>;
    /** Its structure: a hash table, or for a sorted index its blocks in key order. */
    readonly hash: HashTable | null;
    readonly sorted: SortedTable | null;
    /** Scratch: a key's words, by entity index the pass that last saw it, and the entity indexes a refresh goes over. */
    readonly key: Uint32Array;
    stamps: Int32Array;
    pass: number;
    pending: Int32Array;
    pendingArchetypes: Int32Array;
    pendingRows: Int32Array;
    /** What an incremental refresh changes, by bucket: removals' entity indexes and insertions' entries. */
    operations: Int32Array;
    /** A unique index's insertions of a refresh, as bucket and entity index pairs. */
    inserted: Int32Array;
    /**
     * What a rebuild lists, kept for the next: entries, keys' words and hashes, and buckets, by entry; for a sorted
     * index, the entries' order and a spare for sorting it, and a digit histogram.
     */
    readonly built: { entries: Int32Array; keys: Uint32Array; hashes: Uint32Array; buckets: Int32Array; order: Int32Array; spare: Int32Array; readonly histogram: Int32Array };
    /** What a build across the pool lists, in the arena, kept for the next; null before the first. */
    pooled: Pooled | null;
    /** A merge's scratch, kept for the next: by bucket, its operations' start; operations in bucket order; removals, insertions and a segment. */
    merging: { starts: Int32Array; order: Int32Array; removed: Int32Array; added: Int32Array; segment: Int32Array };
};

/** A build across the pool's arrays in the arena (`index-build.ts`): by entry, by piece, by partition, and its plan. */
type Pooled = {
    readonly grouped: Int32Array;
    readonly groupedKeys: Uint32Array;
    readonly groupedHashes: Uint32Array;
    readonly local: Int32Array;
    readonly first: Int32Array;
    readonly lengths: Int32Array;
    readonly overflow: Int32Array;
    readonly histogram: Int32Array;
    /** By partition: starts, `maximumPartitions + 1` of them; buckets, capacity, crowded buckets, bucket and capacity bases, overflowed. */
    readonly partitions: Int32Array;
    plan: Float64Array;
};

/** Below this many changes, and up to an eighth of what an index holds, a refresh patches it rather than building it again. */
const rebuildMinimum = 4096;

/** The index a world keeps for a declaration, created and counted as one more user; nothing is built until it's refreshed. */
export const acquireIndex = (state: State, definition: IndexDefinition): WorldIndex => {
    const existing = state.indexes.get(definition);
    if (existing !== undefined) {
        existing.users++;
        return existing;
    }
    const { key, components, unique } = definition.declaration;
    const keys = key.map(part => idOf(state, part));
    const { parts, words } = keyPartsOf(keys.map(id => state.layouts[id]));
    const sorted = keptSorted(definition.declaration);
    const index: WorldIndex = {
        definition,
        label: labelOfItem(definition),
        users: 1,
        keys,
        has: (components?.has ?? []).map(component => idOf(state, component)),
        not: (components?.not ?? []).map(component => idOf(state, component)),
        parts,
        objects: parts.some(part => part.kind === "object"),
        words,
        unique: unique === true,
        member: new Int8Array(16),
        members: [],
        position: -1,
        refreshed: 0,
        changed: 0,
        watchers: new Map(),
        scanned: new Map(),
        hash: sorted ? null : createHashTable(state.memory, words),
        sorted: sorted ? createSortedTable(state.memory, words, parts) : null,
        key: new Uint32Array(Math.max(1, words)),
        stamps: new Int32Array(0),
        pass: 0,
        pending: new Int32Array(64),
        pendingArchetypes: new Int32Array(64),
        pendingRows: new Int32Array(64),
        operations: new Int32Array(64),
        inserted: new Int32Array(64),
        built: { entries: new Int32Array(0), keys: new Uint32Array(0), hashes: new Uint32Array(0), buckets: new Int32Array(0), order: new Int32Array(0), spare: new Int32Array(0), histogram: new Int32Array(sorted && words > 0 ? 65536 : 0) },
        pooled: null,
        merging: { starts: new Int32Array(0), order: new Int32Array(0), removed: new Int32Array(0), added: new Int32Array(0), segment: new Int32Array(0) },
    };
    state.indexes.set(definition, index);
    state.journal.readers++;
    return index;
};

/** One fewer user; the last one releases what the index holds, its arena blocks included. */
export const releaseIndex = (state: State, index: WorldIndex): void => {
    if (--index.users > 0) return;
    state.indexes.delete(index.definition);
    state.journal.readers--;
    if (index.hash !== null) releaseHashTable(index.hash);
    if (index.sorted !== null) releaseSortedTable(index.sorted);
    if (index.pooled !== null) freePooled(state, index.pooled);
    index.pooled = null;
};

/** Entries an index holds. */
const sizeOf = (index: WorldIndex): number => index.hash?.size ?? index.sorted?.size ?? 0;

/** Counts one more lookup watching a component, whose changes then stamp the buckets holding its rows. */
export const watchIndex = (state: State, index: WorldIndex, component: number): void => {
    const count = index.watchers.get(component) ?? 0;
    index.watchers.set(component, count + 1);
    if (count > 0) return;
    if (index.hash !== null) watchHashComponent(index.hash, component, state.tick);
    if (index.sorted !== null) watchSortedComponent(index.sorted, component, state.tick);
    index.scanned.set(component, state.tick);
};

/** Counts one fewer lookup watching a component. */
export const unwatchIndex = (index: WorldIndex, component: number): void => {
    const count = (index.watchers.get(component) ?? 0) - 1;
    if (count > 0) {
        index.watchers.set(component, count);
        return;
    }
    index.watchers.delete(component);
    index.scanned.delete(component);
    if (index.hash !== null) unwatchHashComponent(index.hash, component);
    if (index.sorted !== null) unwatchSortedComponent(index.sorted, component);
};

/** Notes the archetypes created since it last looked that it holds the entities of. */
const refreshMembers = (state: State, index: WorldIndex): void => {
    const { archetypes } = state;
    if (index.member.length < archetypes.length) {
        const grown = new Int8Array(Math.max(archetypes.length, 2 * index.member.length));
        grown.set(index.member);
        index.member = grown;
    }
    const { member } = index;
    for (let id = 0; id < archetypes.length; id++) {
        if (member[id] !== 0) continue;
        const archetype = archetypes[id];
        const { storageById } = archetype;
        let holds = !archetype.resource && !(archetype.meta && index.keys.length === 0 && index.has.length === 0);
        for (let k = 0; holds && k < index.keys.length; k++) holds = storageById[index.keys[k]] !== undefined;
        for (let k = 0; holds && k < index.has.length; k++) holds = storageById[index.has[k]] !== undefined;
        for (let k = 0; holds && k < index.not.length; k++) holds = storageById[index.not[k]] === undefined;
        member[id] = holds ? 1 : 2;
        if (holds) index.members.push(archetype);
    }
};

/** Writes a row's key into `out` from `at`, interning its object parts' values when `intern` is set. */
const encodeRow = (index: WorldIndex, archetype: Archetype, row: number, out: Uint32Array, at: number, intern: boolean): void => {
    const { parts, keys } = index;
    for (let p = 0; p < parts.length; p++) {
        const storage = archetype.storageById[keys[p]];
        if (storage !== undefined) encodeStored(parts[p], storage, row, out, at + parts[p].first, intern);
    }
};

/** Whether any object part's value in `key` is one nothing holds yet. */
const unknownValue = (index: WorldIndex, key: Uint32Array): boolean => {
    for (const part of index.parts) if (part.kind === "object" && key[part.first] === missing) return true;
    return false;
};

/** Each object part's value in a key's words from `at`, interned once more (`retain`) or once less (`release`). */
const holdWords = (index: WorldIndex, words: Uint32Array, at: number, hold: boolean): void => {
    for (const part of index.parts) {
        if (part.kind !== "object") continue;
        const id = words[at + part.first];
        if (hold) retain(part, id);
        else releaseInterned(part, id);
    }
};

/** Each object part's value in bucket `bucket`'s key, interned once more or once less. */
const holdKey = (hash: HashTable, index: WorldIndex, bucket: number, hold: boolean): void => {
    if (index.objects) holdWords(index, hash.records, bucket * hash.stride + recordKey, hold);
};

/** A key's values, for a failure's message: those of a row holding it. */
const keyText = (state: State, index: WorldIndex, archetype: Archetype, row: number): string => {
    const values = index.keys.map(id => {
        const storage = archetype.storageById[id];
        return storage === undefined ? undefined : readCell(storage, row);
    });
    const text = (value: unknown): string => {
        try {
            return typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value) ?? String(value);
        }
        catch {
            return String(value);
        }
    };
    return values.length === 1 ? text(values[0]) : `[${values.map(text).join(", ")}]`;
};

/** The entity an entry names, read from its archetype's row. */
const entityOf = (state: State, entries: Int32Array, at: number): number => state.archetypes[entries[at + 1]].entities[entries[at + 2]];

/**
 * A unique index's failure: entity index `inserted` was filed in a bucket holding another entity. The bucket's first
 * entry, the lower entity index, is the one lookups give.
 */
const conflict = (state: State, index: WorldIndex, hash: HashTable, bucket: number, inserted: number, failures: Failure[]): void => {
    const { entries } = hash;
    const first = startOf(hash, bucket) * entryWords;
    const kept = entityOf(state, entries, first);
    const other = entries[first] === inserted ? entityOf(state, entries, first + entryWords) : liveEntity(state, inserted);
    reportConflict(state, index, kept, other, state.archetypes[entries[first + 1]], entries[first + 2], failures);
};

/** The entity a live entity index is. */
const liveEntity = (state: State, index: number): number => state.archetypes[state.entities.archetype[index]].entities[state.entities.row[index]];

/** A unique index's failure: entities `kept`, the lower entity index, and `other` share the key the row given holds. */
const reportConflict = (state: State, index: WorldIndex, kept: number, other: number, archetype: Archetype, row: number, failures: Failure[]): void => {
    failures.push({
        kind: "index",
        name: index.label,
        message: `Index "${index.label}" is unique, and entities ${kept} and ${other} both have key ${keyText(state, index, archetype, row)}; lookups give ${kept}, the one with the lower entity index.`,
        stack: null,
    });
};

/**
 * A sorted unique index's failure: entity index `inserted`'s entry is beside another of its key, the first of whose
 * entries, the lower entity index, lookups give.
 */
const sortedConflict = (state: State, index: WorldIndex, sorted: SortedTable, inserted: number, failures: Failure[]): void => {
    const base = entryOf(sorted, inserted);
    if (base < 0) return;
    const { entries, words } = sorted;
    // The first entry of its key, walking back across blocks.
    let first = base;
    const before = previousEntry(sorted, base);
    const after = nextEntry(sorted, base);
    const sameAt = (other: number): boolean => other >= 0 && sameStoredKey(sorted, other, entries, base);
    if (!sameAt(before) && !sameAt(after)) return;
    for (let previous = before; sameAt(previous); previous = previousEntry(sorted, previous)) first = previous;
    const other = first === base ? (sameAt(after) ? after : before) : base;
    const kept = state.archetypes[entries[first + words + 1]].entities[entries[first + words + 2]];
    const second = state.archetypes[entries[other + words + 1]].entities[entries[other + words + 2]];
    reportConflict(state, index, kept, second, state.archetypes[entries[first + words + 1]], entries[first + words + 2], failures);
};

/** The entry before or after the one at `base`, across blocks, or -1. */
const previousEntry = (sorted: SortedTable, base: number): number => {
    const block = Math.floor(base / (blockEntries * sorted.stride));
    const offset = (base - blockBase(sorted, block)) / sorted.stride;
    if (offset > 0) return base - sorted.stride;
    const k = sorted.positions[block];
    if (k === 0) return -1;
    const previous = sorted.order[k - 1];
    return blockBase(sorted, previous) + (sorted.lengths[previous] - 1) * sorted.stride;
};
const nextEntry = (sorted: SortedTable, base: number): number => {
    const block = Math.floor(base / (blockEntries * sorted.stride));
    const offset = (base - blockBase(sorted, block)) / sorted.stride;
    if (offset + 1 < sorted.lengths[block]) return base + sorted.stride;
    const k = sorted.positions[block];
    if (k + 1 >= sorted.blocks) return -1;
    return blockBase(sorted, sorted.order[k + 1]);
};

/** Grows a scratch array of entity indexes to at least `length`, keeping its contents. */
const fit = (array: Int32Array, length: number): Int32Array => {
    if (array.length >= length) return array;
    const grown = new Int32Array(Math.max(length, 2 * array.length));
    grown.set(array);
    return grown;
};

/**
 * Adds an entity index to a refresh's pending ones, with the archetype id and row a scan found it at, or -1 for one the
 * journal lists, which `patch` locates.
 */
const list = (index: WorldIndex, entity: number, archetype: number, row: number, count: number): number => {
    if (count === index.pending.length) {
        index.pending = fit(index.pending, count + 1);
        index.pendingArchetypes = fit(index.pendingArchetypes, count + 1);
        index.pendingRows = fit(index.pendingRows, count + 1);
    }
    index.pending[count] = entity;
    index.pendingArchetypes[count] = archetype;
    index.pendingRows[count] = row;
    return count + 1;
};

/** `list`, once per entity index. */
const pend = (index: WorldIndex, entity: number, archetype: number, row: number, count: number): number => {
    if (index.stamps[entity] === index.pass) return count;
    index.stamps[entity] = index.pass;
    return list(index, entity, archetype, row, count);
};

/** Calls `each` with every row of a storage whose `changed` tick is after `since`, a whole column a GPU kernel wrote included. */
const changedRows = (archetype: Archetype, storage: Storage, since: number, each: (row: number) => void): void => {
    const whole = storage.columnChanged > since;
    const { changed, chunkChanged } = storage;
    for (let chunk = 0, count = Math.ceil(archetype.count / 2 ** chunkShift); chunk < count; chunk++) {
        if (!whole && !(chunkChanged[chunk] > since)) continue;
        for (let row = chunk << chunkShift, end = Math.min(archetype.count, (chunk + 1) << chunkShift); row < end; row++) {
            if (whole || changed[row] > since) each(row);
        }
    }
};

/** Whether a component may have been written since `since`: by a system, or by a command's value at a sync point. */
const writtenSince = (state: State, component: number, since: number): boolean => state.written[component] > since || state.valuesWritten > since;

/** Refreshes the indexes of a tier, or of the finalizers, before they run, their conflicts going in the run's report. */
export const refreshUses = (state: State, uses: readonly IndexUse[], pool: Pool | null = null): Promise<void> | null => {
    for (let k = 0; k < uses.length; k++) {
        const pending = refreshIndex(state, uses[k].index, uses[k].watching, state.indexFailures, pool);
        if (pending !== null) return finishUses(state, uses, k + 1, pending, pool);
    }
    return null;
};

/** The rest of `refreshUses` once a refresh building across the pool is done. */
const finishUses = async (state: State, uses: readonly IndexUse[], from: number, pending: Promise<void>, pool: Pool | null): Promise<void> => {
    await pending;
    for (let k = from; k < uses.length; k++) {
        const next = refreshIndex(state, uses[k].index, uses[k].watching, state.indexFailures, pool);
        if (next !== null) await next;
    }
};

/** Each index the runners use once, with every component their lookups there watch. */
export const mergeUses = (runners: readonly { readonly indexes: readonly IndexUse[] }[]): readonly IndexUse[] => {
    let merged: Map<WorldIndex, Set<number>> | null = null;
    for (const runner of runners) {
        for (const use of runner.indexes) {
            merged ??= new Map();
            let watching = merged.get(use.index);
            if (watching === undefined) merged.set(use.index, watching = new Set());
            for (const component of use.watching) watching.add(component);
        }
    }
    return merged === null ? noUses : [...merged].map(([index, watching]) => ({ index, watching: [...watching] }));
};

/**
 * Brings an index up to date before a tier of systems that use it, or the finalize phase: rebuilt the first time, and
 * when the journal dropped entries it hadn't read or more than an eighth of it would change; else patched for the
 * entities the journal lists and the rows whose key parts changed since its last refresh. Each component in `watching`,
 * which a lookup of the tier watches, stamps the buckets of its rows that changed. Conflicts of a unique index go in
 * `failures`.
 */
export const refreshIndex = (state: State, index: WorldIndex, watching: readonly number[], failures: Failure[], pool: Pool | null = null): Promise<void> | null => {
    const { journal } = state;
    const end = journalEnd(journal);
    const since = index.refreshed;
    const tick = state.tick;
    let keyed = false;
    for (let k = 0; k < index.keys.length && !keyed; k++) keyed = writtenSince(state, index.keys[k], since);
    let pending: Promise<void> | null = null;
    if (index.position < 0 || index.position < journal.first) pending = rebuildAny(state, index, tick, failures, pool);
    else if (index.position !== end || keyed) pending = refresh(state, index, end, keyed, tick, failures, pool);
    if (pending !== null) return finishRefresh(state, index, end, tick, watching, pending);
    refreshed(state, index, end, tick, watching);
    return null;
};

/** Notes a refresh up to journal position `end` at `tick`, and stamps the buckets of watched components' changes. */
const refreshed = (state: State, index: WorldIndex, end: number, tick: number, watching: readonly number[]): void => {
    index.position = end;
    index.refreshed = tick;
    for (let k = 0; k < watching.length; k++) scanWatched(state, index, watching[k], tick);
};

const finishRefresh = async (state: State, index: WorldIndex, end: number, tick: number, watching: readonly number[], pending: Promise<void>): Promise<void> => {
    await pending;
    refreshed(state, index, end, tick, watching);
};

/** Builds an index again: in phases, across the pool when there is one, for a large hash index keyed by structs; else here. */
const rebuildAny = (state: State, index: WorldIndex, tick: number, failures: Failure[], pool: Pool | null): Promise<void> | null => {
    index.changed = tick;
    const phased = rebuildPhased(state, index, tick, failures, pool);
    if (phased !== false) return phased;
    rebuild(state, index, tick, failures);
    return null;
};

/** Patches an index for the entities the journal lists from its position to `end` and, when `keyed`, those whose key changed. */
const refresh = (state: State, index: WorldIndex, end: number, keyed: boolean, tick: number, failures: Failure[], pool: Pool | null): Promise<void> | null => {
    refreshMembers(state, index);
    const { journal, entities } = state;
    // Rows a scan of one key part finds are each listed once; the journal's entries, and several parts, need marks.
    const marking = index.position !== end || index.keys.length > 1;
    if (marking) {
        if (index.stamps.length < entities.length) {
            const grown = new Int32Array(Math.max(entities.length, 2 * index.stamps.length));
            grown.set(index.stamps);
            index.stamps = grown;
        }
        index.pass++;
    }
    // Past what a patch takes it's built again: listing stops once the rows found pass it.
    const most = Math.max(rebuildMinimum, sizeOf(index) / 8);
    if (end - index.position > most) return rebuildAny(state, index, tick, failures, pool);
    let count = 0;
    for (let at = index.position; at < end; at++) count = pend(index, journal.indexes[at - journal.first], -1, 0, count);
    if (keyed) {
        const since = index.refreshed;
        for (const archetype of index.members) {
            const rows = archetype.entities;
            const id = archetype.id;
            for (const part of index.keys) {
                const storage = archetype.storageById[part];
                if (storage === undefined || !storage.ticked || !writtenSince(state, part, since)) continue;
                const whole = storage.columnChanged > since;
                const { changed, chunkChanged } = storage;
                for (let chunk = 0, chunks = Math.ceil(archetype.count / 2 ** chunkShift); chunk < chunks; chunk++) {
                    if (!whole && !(chunkChanged[chunk] > since)) continue;
                    for (let row = chunk << chunkShift, end = Math.min(archetype.count, (chunk + 1) << chunkShift); row < end; row++) {
                        if (!whole && !(changed[row] > since)) continue;
                        count = marking ? pend(index, rows[row] >>> 0, id, row, count) : list(index, rows[row] >>> 0, id, row, count);
                        if (count > most) return rebuildAny(state, index, tick, failures, pool);
                    }
                }
            }
        }
    }
    if (count === 0) return null;
    if (count > most) return rebuildAny(state, index, tick, failures, pool);
    if (index.hash !== null) patch(state, index, index.hash, count, tick, failures);
    else if (index.sorted !== null) patchSorted(state, index, index.sorted, count, tick, failures);
    return null;
};

/**
 * A bucket at least this long takes a refresh's operations in one merge, rather than a shift each; shorter ones take
 * each as it comes.
 */
const mergeMinimum = 64;

/**
 * Files each pending entity in the bucket of its key, or none: an operation applies at once on a short bucket, and on
 * a long one waits to merge with the bucket's others. A unique index's buckets holding two entries once every
 * operation applied are conflicts.
 */
const patch = (state: State, index: WorldIndex, hash: HashTable, count: number, tick: number, failures: Failure[]): void => {
    const { pending, key, words, pendingArchetypes, pendingRows } = index;
    const { entities } = state;
    coverEntities(hash, entities.length);
    // Each waiting operation: bucket, entity index, archetype id or -1 for a removal, row.
    let waiting = 0;
    const wait = (bucket: number, entity: number, archetype: number, row: number): void => {
        if (4 * (waiting + 1) > index.operations.length) index.operations = fit(index.operations, 4 * (waiting + 1));
        const at = 4 * waiting++;
        index.operations[at] = bucket;
        index.operations[at + 1] = entity;
        index.operations[at + 2] = archetype;
        index.operations[at + 3] = row;
    };
    // A unique index's insertions, as bucket and entity index pairs, checked once all apply.
    let inserted = 0;
    const remove = (bucket: number, entity: number): void => {
        index.changed = tick;
        holdKey(hash, index, bucket, false);
        if (lengthOf(hash, bucket) >= mergeMinimum) wait(bucket, entity, -1, 0);
        else removeEntry(hash, bucket, entity, tick);
    };
    for (let k = 0; k < count; k++) {
        const entity = pending[k];
        const scanned = pendingArchetypes[k];
        const archetypeId = scanned >= 0 ? scanned : entity < entities.length ? entities.archetype[entity] : -1;
        const old = hash.bucketOf[entity];
        if (archetypeId < 0 || index.member[archetypeId] !== 1) {
            if (old < 0) continue;
            remove(old, entity);
            hash.bucketOf[entity] = -1;
            continue;
        }
        const archetype = state.archetypes[archetypeId];
        const row = scanned >= 0 ? pendingRows[k] : entities.row[entity];
        encodeRow(index, archetype, row, key, 0, false);
        // A value nothing held is interned now, once for this entry, with the rest of its key.
        const fresh = index.objects && unknownValue(index, key);
        if (fresh) encodeRow(index, archetype, row, key, 0, true);
        const bucket = bucketFor(hash, key, 0, hashWords(key, 0, words), tick);
        if (bucket === old) {
            relocate(hash, bucket, entity, archetypeId, row);
            continue;
        }
        if (!fresh) holdKey(hash, index, bucket, true);
        index.changed = tick;
        if (old >= 0) remove(old, entity);
        if (lengthOf(hash, bucket) >= mergeMinimum) wait(bucket, entity, archetypeId, row);
        else insertEntry(hash, bucket, entity, archetypeId, row, tick);
        hash.bucketOf[entity] = bucket;
        if (index.unique) {
            if (2 * (inserted + 1) > index.inserted.length) index.inserted = fit(index.inserted, 2 * (inserted + 1));
            index.inserted[2 * inserted] = bucket;
            index.inserted[2 * inserted++ + 1] = entity;
        }
    }
    if (waiting > 0) merge(index, hash, waiting, tick);
    for (let k = 0; k < inserted; k++) {
        const bucket = index.inserted[2 * k];
        if (lengthOf(hash, bucket) > 1 && hash.bucketOf[index.inserted[2 * k + 1]] === bucket) conflict(state, index, hash, bucket, index.inserted[2 * k + 1], failures);
    }
    tidyHashTable(hash, tick);
};

/** The object parts' values of a key's words from `at`, for comparing a sorted index's entries with them. */
const valuesOfKey = (index: WorldIndex, key: Uint32Array, at: number, values: unknown[]): readonly unknown[] => {
    for (let p = 0; p < index.parts.length; p++) {
        const part = index.parts[p];
        values[p] = part.kind === "object" ? part.interned.values[key[at + part.first]] : undefined;
    }
    return values;
};

/** Moves each pending entity's entry of a sorted index to its key's place, or removes it. */
const patchSorted = (state: State, index: WorldIndex, sorted: SortedTable, count: number, tick: number, failures: Failure[]): void => {
    const { pending, key, pendingArchetypes, pendingRows } = index;
    const { entities } = state;
    coverSortedEntities(sorted, entities.length);
    const objects = index.parts.some(part => part.kind === "object");
    const values: unknown[] = [];
    let inserted = 0;
    for (let k = 0; k < count; k++) {
        const entity = pending[k];
        const scanned = pendingArchetypes[k];
        const archetypeId = scanned >= 0 ? scanned : entity < entities.length ? entities.archetype[entity] : -1;
        const old = entryOf(sorted, entity);
        if (archetypeId < 0 || index.member[archetypeId] !== 1) {
            if (old < 0) continue;
            if (objects) holdWords(index, sorted.entries, old, false);
            removeSorted(sorted, entity, tick);
            index.changed = tick;
            continue;
        }
        const archetype = state.archetypes[archetypeId];
        const row = scanned >= 0 ? pendingRows[k] : entities.row[entity];
        encodeRow(index, archetype, row, key, 0, false);
        const fresh = index.objects && unknownValue(index, key);
        if (fresh) encodeRow(index, archetype, row, key, 0, true);
        if (old >= 0 && !fresh && sameStoredKey(sorted, old, key, 0)) {
            relocateSorted(sorted, entity, archetypeId, row);
            continue;
        }
        if (objects && !fresh) holdWords(index, key, 0, true);
        if (old >= 0) {
            if (objects) holdWords(index, sorted.entries, old, false);
            removeSorted(sorted, entity, tick);
        }
        insertSorted(sorted, key, 0, objects ? valuesOfKey(index, key, 0, values) : values, entity, archetypeId, row, tick);
        index.changed = tick;
        if (index.unique) {
            if (inserted + 1 > index.inserted.length) index.inserted = fit(index.inserted, inserted + 1);
            index.inserted[inserted++] = entity;
        }
    }
    for (let k = 0; k < inserted; k++) sortedConflict(state, index, sorted, index.inserted[k], failures);
};

/** Applies the operations long buckets wait with, each bucket's in one merge, in entity order. */
const merge = (index: WorldIndex, hash: HashTable, count: number, tick: number): void => {
    const operations = index.operations;
    const merging = index.merging;
    // By bucket, counted then placed, in the order they came; then each bucket's by entity index.
    if (merging.starts.length < hash.count + 1) merging.starts = new Int32Array(Math.max(hash.count + 1, 2 * merging.starts.length));
    if (merging.order.length < count) {
        const length = Math.max(count, 2 * merging.order.length);
        merging.order = new Int32Array(length);
        merging.removed = new Int32Array(length);
        merging.added = new Int32Array(length * entryWords);
    }
    const { starts, order, removed, added } = merging;
    starts.fill(0, 0, hash.count + 1);
    for (let k = 0; k < count; k++) starts[operations[4 * k] + 1]++;
    for (let bucket = 0; bucket < hash.count; bucket++) starts[bucket + 1] += starts[bucket];
    for (let k = 0; k < count; k++) order[starts[operations[4 * k]]++] = k;
    let scratch = merging.segment;
    for (let start = 0; start < count;) {
        const bucket = operations[4 * order[start]];
        let end = start + 1;
        while (end < count && operations[4 * order[end]] === bucket) end++;
        // Insertion sort by entity index: a bucket's operations of one refresh are few.
        for (let k = start + 1; k < end; k++) {
            const moved = order[k];
            const entity = operations[4 * moved + 1];
            let at = k;
            while (at > start && operations[4 * order[at - 1] + 1] > entity) {
                order[at] = order[at - 1];
                at--;
            }
            order[at] = moved;
        }
        let removals = 0;
        let insertions = 0;
        for (let k = start; k < end; k++) {
            const at = 4 * order[k];
            if (operations[at + 2] < 0) removed[removals++] = operations[at + 1];
            else {
                added[insertions * entryWords] = operations[at + 1];
                added[insertions * entryWords + 1] = operations[at + 2];
                added[insertions * entryWords + 2] = operations[at + 3];
                insertions++;
            }
        }
        const length = lengthOf(hash, bucket) * entryWords;
        if (scratch.length < length) scratch = new Int32Array(Math.max(length, 2 * scratch.length));
        mergeEntries(hash, bucket, removed, removals, added, insertions, scratch, tick);
        start = end;
    }
    merging.segment = scratch;
};

/** Builds an index from every entity it holds, in entity order. */
const rebuild = (state: State, index: WorldIndex, tick: number, failures: Failure[]): void => {
    refreshMembers(state, index);
    const { entities } = state;
    const { member, words } = index;
    // Interned values start again, each counted by the entries that hold it.
    for (const part of index.parts) {
        if (part.kind !== "object") continue;
        part.interned.ids.clear();
        part.interned.values.length = 0;
        part.interned.counts.length = 0;
        part.interned.free.length = 0;
    }
    let total = 0;
    for (const archetype of index.members) total += archetype.count;
    // Kept for the next rebuild.
    const built = index.built;
    if (built.hashes.length < total) {
        const length = Math.max(total, 2 * built.hashes.length);
        built.entries = new Int32Array(length * entryWords);
        built.keys = new Uint32Array(Math.max(1, length * words));
        built.hashes = new Uint32Array(length);
        built.buckets = new Int32Array(length);
    }
    const { entries: listed, keys, hashes } = built;
    const hashing = index.hash !== null;
    let count = 0;
    const add = (entity: number): void => {
        const archetypeId = entities.archetype[entity];
        const archetype = state.archetypes[archetypeId];
        const row = entities.row[entity];
        listed[count * entryWords] = entity;
        listed[count * entryWords + 1] = archetypeId;
        listed[count * entryWords + 2] = row;
        encodeRow(index, archetype, row, keys, count * words, true);
        if (hashing) hashes[count] = hashWords(keys, count * words, words);
        count++;
    };
    // Few entities among many: theirs sorted; else every entity index in turn.
    if (total * Math.log2(total + 2) < entities.length) {
        const found = new Int32Array(total);
        let at = 0;
        for (const archetype of index.members) for (let row = 0; row < archetype.count; row++) found[at++] = archetype.entities[row] >>> 0;
        found.sort();
        for (let k = 0; k < at; k++) add(found[k]);
    }
    else {
        for (let entity = 1; entity < entities.length; entity++) {
            const archetypeId = entities.archetype[entity];
            if (archetypeId >= 0 && member[archetypeId] === 1) add(entity);
        }
    }
    for (const component of index.scanned.keys()) index.scanned.set(component, tick);
    const { hash, sorted } = index;
    if (sorted !== null) {
        const order = sortedOrder(index, count, keys);
        loadSortedTable(sorted, count, keys, listed, order, tick, entities.length);
        if (!index.unique) return;
        for (let k = 1; k < count; k++) {
            const previous = order[k - 1];
            const entry = order[k];
            let same = true;
            for (let w = 0; w < words && same; w++) same = keys[previous * words + w] === keys[entry * words + w];
            if (!same) continue;
            let first = k - 1;
            while (first > 0 && keyEquals(keys, words, order[first - 1], order[first])) first--;
            const kept = order[first];
            reportConflict(state, index, state.archetypes[listed[3 * kept + 1]].entities[listed[3 * kept + 2]], state.archetypes[listed[3 * entry + 1]].entities[listed[3 * entry + 2]], state.archetypes[listed[3 * kept + 1]], listed[3 * kept + 2], failures);
        }
        return;
    }
    if (hash === null) return;
    loadHashTable(hash, count, listed, keys, hashes, built.buckets, tick, entities.length);
    if (!index.unique) return;
    for (let bucket = 0; bucket < hash.count; bucket++) {
        const length = lengthOf(hash, bucket);
        for (let k = 1; k < length; k++) conflict(state, index, hash, bucket, hash.entries[(startOf(hash, bucket) + k) * entryWords], failures);
    }
};

/** Entries below which `rebuild` builds an index: phases cost more than they save. */
const poolMinimum = 1 << 16;

const freePooled = (state: State, pooled: Pooled): void => {
    for (const array of [
        pooled.grouped, pooled.groupedKeys, pooled.groupedHashes, pooled.local, pooled.first, pooled.lengths, pooled.overflow, pooled.histogram,
        pooled.partitions, pooled.plan,
    ]) freeArray(state.memory, array);
};

/** A pooled build's arrays for `count` entries and `pieces` pieces, those kept from the last when they're large enough. */
const pooledFor = (state: State, index: WorldIndex, count: number, pieces: number): Pooled => {
    const kept = index.pooled;
    if (kept !== null && kept.groupedHashes.length >= count && kept.histogram.length >= pieces * maximumPartitions) return kept;
    if (kept !== null) freePooled(state, kept);
    const length = Math.max(count, 2 * (kept?.groupedHashes.length ?? 0));
    const piecesHeld = Math.max(pieces, 2 * (kept === null ? 0 : kept.histogram.length / maximumPartitions));
    const memory = state.memory;
    const pooled: Pooled = {
        grouped: allocateArray(memory, Int32Array, length * entryWords),
        groupedKeys: allocateArray(memory, Uint32Array, Math.max(1, length * index.words)),
        groupedHashes: allocateArray(memory, Uint32Array, length),
        local: allocateArray(memory, Int32Array, length),
        first: allocateArray(memory, Int32Array, length),
        lengths: allocateArray(memory, Int32Array, length),
        overflow: allocateArray(memory, Int32Array, length),
        histogram: allocateArray(memory, Int32Array, piecesHeld * maximumPartitions),
        partitions: allocateArray(memory, Int32Array, 7 * maximumPartitions + 1),
        plan: allocateArray(memory, Float64Array, 64),
    };
    index.pooled = pooled;
    return pooled;
};

/** Writes a plan into the pooled build's plan block, growing it as needed; returns its byte address. */
const placePlan = (state: State, pooled: Pooled, build: HashBuild): number => {
    const words = planWords(build);
    if (pooled.plan.length < words) {
        freeArray(state.memory, pooled.plan);
        pooled.plan = allocateArray(state.memory, Float64Array, Math.max(words, 2 * pooled.plan.length));
    }
    writePlan(new Float64Array(state.memory.memory.buffer), pooled.plan.byteOffset >> 3, build);
    return pooled.plan.byteOffset;
};

/**
 * Runs a phase over `count` pieces or partitions, one at a time, claimed by the workers through their task rings; when
 * a worker failed, the whole phase runs again here, which each phase allows. Resolves with whether the workers ran it.
 */
const runPhase = async (state: State, pool: Pool, phase: Phase, build: HashBuild, plan: number, count: number): Promise<boolean> => {
    if (count === 0) return true;
    const results = await Promise.all(pool.claimed(0, pool.size, { kernel: buildKernel, archetype: phases.indexOf(phase), start: 0, end: count, tick: 0, lastRun: 0, scalars: [plan], partials: -1, partialBytes: 0 }, 1));
    if (results.every(result => result.error === undefined)) return true;
    runBuildStep(buildViews(state.memory.memory.buffer), build, phase, 0, count);
    return false;
};

/** A leaf's stored type's code, for a build's plan. */
const codeOf = (scalar: keyof typeof scalarCodes): number => scalarCodes[scalar];

/**
 * Builds a hash index again in phases over fixed pieces and partitions (`index-build.ts`): across the pool when there
 * is one, its phases claimed by workers, else on this thread; either way the same index, whatever the number of
 * workers. Null when it built here, or for an index it doesn't build: one in memory workers can't share, a sorted one,
 * one with an object key part, or one too small or sparse to gain, which `rebuild` builds.
 */
const rebuildPhased = (state: State, index: WorldIndex, tick: number, failures: Failure[], pool: Pool | null): Promise<void> | null | false => {
    const { hash } = index;
    if (hash === null || !state.memory.shared || index.parts.some(part => part.kind === "object")) return false;
    refreshMembers(state, index);
    let total = 0;
    for (const archetype of index.members) total += archetype.count;
    // Phases walk every entity index, as `rebuild` does unless few among many are members.
    if (total < poolMinimum || total * Math.log2(total + 2) < state.entities.length) return false;
    state.phasedBuilds++;
    const build = startBuild(state, index, hash, total, tick);
    const views = (): BuildViews => buildViews(state.memory.memory.buffer);
    if (pool === null || pool.size === 0) {
        runBuildStep(views(), build.listing, "count", 0, build.pieces);
        placeGroups(state, build);
        runBuildStep(views(), build.listing, "list", 0, build.pieces);
        runBuildStep(views(), build.listing, "group", 0, build.partitions);
        const filling = sizeTable(state, build);
        runBuildStep(views(), filling, "fill", 0, build.partitions);
        finishBuild(state, build, filling, failures);
        return null;
    }
    state.pooledBuilds++;
    return (async (): Promise<void> => {
        await runPhase(state, pool, "count", build.listing, build.plan, build.pieces);
        placeGroups(state, build);
        await runPhase(state, pool, "list", build.listing, build.plan, build.pieces);
        await runPhase(state, pool, "group", build.listing, build.plan, build.partitions);
        const filling = sizeTable(state, build);
        if (!await runPhase(state, pool, "fill", filling, placePlan(state, build.pooled, filling), build.partitions) && filling.placing) {
            // A fill that ran again here placed its partitions' buckets again: they're placed once more from empty slots.
            hash.slots.fill(0);
            runBuildStep(views(), filling, "fill", 0, build.partitions);
        }
        finishBuild(state, build, filling, failures);
    })();
};

/** A build in progress: its index, table and arrays, its plan for listing and grouping, and what grouping found. */
type Build = {
    readonly index: WorldIndex;
    readonly hash: HashTable;
    readonly pooled: Pooled;
    readonly total: number;
    readonly tick: number;
    readonly pieces: number;
    readonly partitions: number;
    readonly slots: number;
    readonly listing: HashBuild;
    readonly plan: number;
    readonly make: (placing: boolean) => HashBuild;
    buckets: number;
    capacity: number;
    crowded: number;
};

/** Sizes the slots for as many buckets as the index last held and writes the plan for listing and grouping. */
const startBuild = (state: State, index: WorldIndex, hash: HashTable, total: number, tick: number): Build => {
    const { entities } = state;
    const entityEnd = entities.length;
    const pieces = Math.ceil(entityEnd / pieceEntities);
    coverEntities(hash, entityEnd);
    // Sized for as many buckets as it last held, as `loadHashTable` sizes it.
    rehash(hash, Math.min(total, Math.max(16, hash.count - hash.freed.length - hash.empty)));
    const pooled = pooledFor(state, index, total, pieces);
    const slots = hash.slots.length >> 1;
    const partitions = Math.min(maximumPartitions, slots);
    const shift = Math.log2(slots) - Math.log2(partitions);
    const members = new Array<number>(state.archetypes.length).fill(-1);
    const columns: number[] = [];
    const leaves = index.parts.flatMap((part, p) => part.kind === "leaves" ? part.leaves.map(leaf => ({ p, part, leaf })) : []);
    let wordAt = 0;
    const leafWords = leaves.map(({ part, leaf }, k) => {
        if (k === 0 || leaves[k - 1].part !== part) wordAt = part.first;
        const at = wordAt;
        wordAt += leaf.scalar === "f64" ? 2 : 1;
        return at;
    });
    index.members.forEach((archetype, slot) => {
        members[archetype.id] = slot;
        for (const { p } of leaves) columns.push(archetype.storageById[index.keys[p]]?.views.u8.byteOffset ?? 0);
    });
    const at = pooled.partitions.byteOffset;
    const make = (placing: boolean): HashBuild => ({
        entityArchetype: entities.archetype.byteOffset,
        entityRow: entities.row.byteOffset,
        entityEnd,
        pieces,
        words: index.words,
        partitions,
        shift,
        mask: slots - 1,
        histogram: pooled.histogram.byteOffset,
        grouped: pooled.grouped.byteOffset,
        groupedKeys: pooled.groupedKeys.byteOffset,
        groupedHashes: pooled.groupedHashes.byteOffset,
        local: pooled.local.byteOffset,
        starts: at,
        buckets: at + 4 * (maximumPartitions + 1),
        capacity: at + 4 * (2 * maximumPartitions + 1),
        crowded: at + 4 * (3 * maximumPartitions + 1),
        bucketBase: at + 4 * (4 * maximumPartitions + 1),
        capacityBase: at + 4 * (5 * maximumPartitions + 1),
        overflowed: at + 4 * (6 * maximumPartitions + 1),
        first: pooled.first.byteOffset,
        lengths: pooled.lengths.byteOffset,
        overflow: pooled.overflow.byteOffset,
        slots: hash.slots.byteOffset,
        records: hash.records.byteOffset,
        stride: hash.stride,
        ticks: hash.ticks.byteOffset,
        table: hash.entries.byteOffset,
        bucketOf: hash.bucketOf.byteOffset,
        tick,
        placing,
        members,
        columns,
        leafCodes: leaves.map(({ leaf }) => codeOf(leaf.scalar)),
        leafStrides: leaves.map(({ leaf }) => leaf.unitStride),
        leafOffsets: leaves.map(({ leaf }) => leaf.unitOffset),
        leafWords,
        watched: [...hash.watched.values()].map(ticks => ticks.byteOffset),
    });
    const listing = make(true);
    return { index, hash, pooled, total, tick, pieces, partitions, slots, listing, plan: placePlan(state, pooled, listing), make, buckets: 0, capacity: 0, crowded: 0 };
};

/** Each partition's start, and by partition then piece where each piece's entries of it go, from the counts. */
const placeGroups = (state: State, build: Build): void => {
    const { pieces, partitions, pooled } = build;
    const histogram = new Int32Array(state.memory.memory.buffer, pooled.histogram.byteOffset, pieces * partitions);
    const words = new Int32Array(state.memory.memory.buffer, pooled.partitions.byteOffset, 7 * maximumPartitions + 1);
    let position = 0;
    for (let q = 0; q < partitions; q++) {
        words[q] = position;
        for (let piece = 0; piece < pieces; piece++) {
            const count = histogram[piece * partitions + q];
            histogram[piece * partitions + q] = position;
            position += count;
        }
    }
    words[partitions] = position;
};

/** Where each partition's buckets and segments start, the table grown for them; returns the plan for filling. */
const sizeTable = (state: State, build: Build): HashBuild => {
    const { partitions, pooled, hash } = build;
    const words = new Int32Array(state.memory.memory.buffer, pooled.partitions.byteOffset, 7 * maximumPartitions + 1);
    let buckets = 0;
    let capacity = 0;
    let crowded = 0;
    for (let q = 0; q < partitions; q++) {
        words[4 * maximumPartitions + 1 + q] = buckets;
        words[5 * maximumPartitions + 1 + q] = capacity;
        buckets += words[maximumPartitions + 1 + q];
        capacity += words[2 * maximumPartitions + 1 + q];
        crowded += words[3 * maximumPartitions + 1 + q];
    }
    build.buckets = buckets;
    build.capacity = capacity;
    build.crowded = crowded;
    coverBuckets(hash, buckets);
    if (capacity * entryWords > hash.entries.length) {
        freeArray(state.memory, hash.entries);
        hash.entries = allocateArray(state.memory, Int32Array, Math.max(64, capacity) * entryWords);
    }
    // Buckets past what the slots hold are placed here once filled.
    const filling = build.make(slotsHold(build.slots, buckets));
    placePlan(state, pooled, filling);
    return filling;
};

/** The table's counts once filled, buckets past their partitions' slots placed, and a unique index's conflicts reported. */
const finishBuild = (state: State, build: Build, filling: HashBuild, failures: Failure[]): void => {
    const { hash, index, pooled, partitions, buckets, tick } = build;
    hash.count = buckets;
    hash.freed.length = 0;
    hash.empty = 0;
    hash.cleared = tick;
    hash.size = build.total;
    hash.used = build.capacity;
    hash.garbage = 0;
    if (!filling.placing) {
        rehash(hash, buckets);
        placeAll(hash);
    }
    else {
        const words = new Int32Array(state.memory.memory.buffer, pooled.partitions.byteOffset, 7 * maximumPartitions + 1);
        const overflow = new Int32Array(state.memory.memory.buffer, pooled.overflow.byteOffset, build.total);
        for (let q = 0; q < partitions; q++) {
            const overflowed = words[6 * maximumPartitions + 1 + q];
            for (let k = 0; k < overflowed; k++) {
                const bucket = overflow[words[q] + k];
                place(hash.slots, bucket, hash.records[bucket * hash.stride + recordHash]);
            }
        }
    }
    for (const component of index.scanned.keys()) index.scanned.set(component, tick);
    if (!index.unique || build.crowded === 0) return;
    for (let bucket = 0; bucket < hash.count; bucket++) {
        const length = lengthOf(hash, bucket);
        for (let k = 1; k < length; k++) conflict(state, index, hash, bucket, hash.entries[(startOf(hash, bucket) + k) * entryWords], failures);
    }
};

/** Whether entries `a` and `b` of a rebuild's keys have the same words. */
const keyEquals = (keys: Uint32Array, words: number, a: number, b: number): boolean => {
    for (let w = 0; w < words; w++) if (keys[a * words + w] !== keys[b * words + w]) return false;
    return true;
};

/**
 * A rebuild's entries in key order, stably, so equal keys keep entity order: by LSD radix sort over 16-bit digits of
 * the words, skipping digits every entry shares; with object parts, by comparing their values.
 */
const sortedOrder = (index: WorldIndex, count: number, keys: Uint32Array): Int32Array => {
    const { words, built } = index;
    if (built.order.length < count) {
        built.order = new Int32Array(Math.max(count, 2 * built.order.length));
        built.spare = new Int32Array(built.order.length);
    }
    let order = built.order;
    let spare = built.spare;
    for (let k = 0; k < count; k++) order[k] = k;
    if (index.parts.some(part => part.kind === "object")) {
        const values = index.parts.map(part => part.kind === "object" ? part.interned.values : null);
        const ordered = Array.from(order.subarray(0, count)).sort((a, b) => {
            for (let p = 0; p < index.parts.length; p++) {
                const part = index.parts[p];
                if (part.kind === "object") {
                    const found = values[p];
                    const compared = found === null ? 0 : compareObjects(found[keys[a * words + part.first]], found[keys[b * words + part.first]]);
                    if (compared !== 0) return compared;
                    continue;
                }
                if (part.kind === "constant") continue;
                for (let w = part.first; w < part.first + part.words; w++) {
                    const x = keys[a * words + w];
                    const y = keys[b * words + w];
                    if (x !== y) return x < y ? -1 : 1;
                }
            }
            return a - b;
        });
        order.set(ordered);
        return order;
    }
    const histogram = built.histogram;
    for (let w = words - 1; w >= 0; w--) {
        for (let shift = 0; shift < 32; shift += 16) {
            histogram.fill(0);
            for (let k = 0; k < count; k++) histogram[(keys[order[k] * words + w] >>> shift) & 0xFFFF]++;
            // A digit every entry shares orders nothing.
            if (histogram[(keys[order[0] * words + w] >>> shift) & 0xFFFF] === count) continue;
            let sum = 0;
            for (let digit = 0; digit < 65536; digit++) {
                const next = sum + histogram[digit];
                histogram[digit] = sum;
                sum = next;
            }
            for (let k = 0; k < count; k++) {
                const entry = order[k];
                spare[histogram[(keys[entry * words + w] >>> shift) & 0xFFFF]++] = entry;
            }
            const swapped = order;
            order = spare;
            spare = swapped;
        }
    }
    built.order = order;
    built.spare = spare;
    return order;
};

/** Stamps the buckets holding rows whose watched component changed since it was last read, with `tick`. */
const scanWatched = (state: State, index: WorldIndex, component: number, tick: number): void => {
    const since = index.scanned.get(component) ?? tick;
    if (!writtenSince(state, component, since)) return;
    if (index.keys.length === 0 && index.sorted !== null) {
        scanWatchedWhole(index, index.sorted, component, since, tick);
        return;
    }
    const ticks = index.hash?.watched.get(component)?? index.sorted?.watched.get(component)?.ticks;
    if (ticks === undefined) return;
    const holders = index.hash?.bucketOf ?? index.sorted?.blockOf;
    if (holders === undefined) return;
    for (const archetype of index.members) {
        const storage = archetype.storageById[component];
        if (storage === undefined || !storage.ticked) continue;
        const rows = archetype.entities;
        changedRows(archetype, storage, since, row => {
            const holder = holders[rows[row] >>> 0];
            if (holder >= 0) ticks[holder] = tick;
        });
    }
    if (index.sorted !== null) refreshWatchedTree(index.sorted, component);
    index.scanned.set(component, tick);
};

/**
 * `scanWatched` for an index without a key, whose lookups all give every row: a row whose watched component changed
 * stamps one block, found by the ticks of chunks.
 */
const scanWatchedWhole = (index: WorldIndex, sorted: SortedTable, component: number, since: number, tick: number): void => {
    index.scanned.set(component, tick);
    for (const archetype of index.members) {
        const storage = archetype.storageById[component];
        if (storage === undefined || !storage.ticked) continue;
        let changed = storage.columnChanged > since;
        const { chunkChanged } = storage;
        for (let chunk = 0, count = Math.ceil(archetype.count / 2 ** chunkShift); !changed && chunk < count; chunk++) changed = chunkChanged[chunk] > since;
        if (!changed) continue;
        stampWatched(sorted, component, 0, tick);
        return;
    }
};

/** An index a runner looks up through, with the components its lookups there watch. */
export type IndexUse = { readonly index: WorldIndex; readonly watching: readonly number[] };

/** The indexes a declaration's lookups go through and its rows are ordered by, acquired for one user: by lookup name, its order's, as uses, and their release. */
export type IndexLookups = {
    readonly byName: ReadonlyMap<string, WorldIndex>;
    readonly ordered: WorldIndex | null;
    readonly uses: readonly IndexUse[];
    /** The indexes of its lookups with `changed: true`, each once: their entries changing is a change filter. */
    readonly filters: readonly WorldIndex[];
    readonly release: () => void;
};

const noUses: readonly IndexUse[] = [];
const noIndexes: ReadonlyMap<string, WorldIndex> = new Map();
/** What a declaration without lookups through indexes acquires. */
const noFilters: readonly WorldIndex[] = [];
const noLookups: IndexLookups = { byName: noIndexes, ordered: null, uses: noUses, filters: noFilters, release: () => {} };

/** Acquires the indexes a declaration's lookups go through, watching what they watch, once each per index. */
export const acquireLookups = (state: State, lookup: { readonly [name: string]: SystemLookup } | undefined, order?: unknown): IndexLookups => {
    const ordering = indexDefinitionOf(order) ?? null;
    if (lookup === undefined && ordering === null) return noLookups;
    const byName = new Map<string, WorldIndex>();
    const watching = new Map<WorldIndex, Set<number>>();
    const filters: WorldIndex[] = [];
    const acquired = (found: IndexDefinition): WorldIndex => {
        let index = [...watching.keys()].find(other => other.definition === found);
        if (index === undefined) {
            index = acquireIndex(state, found);
            watching.set(index, new Set());
        }
        return index;
    };
    for (const name in lookup) {
        const found = indexOfLookup(lookup[name]);
        if (found === undefined) continue;
        const index = acquired(found);
        byName.set(name, index);
        const declared = lookup[name];
        for (const key of watchedBy(declared)) watching.get(index)?.add(idOf(state, key));
        if (watchesEntries(declared) && !filters.includes(index)) filters.push(index);
    }
    const ordered = ordering === null ? null : acquired(ordering);
    if (watching.size === 0) return noLookups;
    const uses = [...watching].map(([index, components]): IndexUse => {
        for (const component of components) watchIndex(state, index, component);
        return { index, watching: [...components] };
    });
    let released = false;
    return {
        byName,
        ordered,
        uses,
        filters: filters.length === 0 ? noFilters : filters,
        release: () => {
            if (released) return;
            released = true;
            for (const { index, watching: components } of uses) {
                for (const component of components) unwatchIndex(index, component);
                releaseIndex(state, index);
            }
        },
    };
};

/**
 * Before a run: starts ticks and kernels' stamps for what finalizers' indexes follow since the last one. Returns
 * whether it did, so kernels that dropped those stamps load again.
 */
export const startWatches = (state: State): boolean => {
    const pending = state.watchesPending;
    if (pending.length === 0) return false;
    startTicking(state, pending);
    for (const id of pending) observe(state, id);
    pending.length = 0;
    return true;
};
