import type { IndexDefinition } from '../../interface/registry/index.js';
import { indexOfLookup, labelOfItem } from '../../interface/registry/index.js';
import type { Failure } from '../../interface/world/report.js';
import type { Lookup } from '../../interface/system/access.js';
import type { Archetype, Storage } from './archetype.js';
import { readCell } from './cells.js';
import { chunkShift } from './kernel.js';
import { journalEnd } from './journal.js';
import { encodeStored, hashWords, keyPartsOf, missing, release as releaseInterned, retain, type KeyPart } from './index-keys.js';
import {
    bucketFor, coverEntities, createHashTable, entryWords, insertEntry, lengthOf, loadHashTable, mergeEntries, recordKey, relocate, releaseHashTable,
    removeEntry, startOf, tidyHashTable, unwatchHashComponent, watchHashComponent, type HashTable,
} from './index-hash.js';
import { idOf, observe, startTicking, type State } from './state.js';
import {
    blockBase, blockEntries, coverSortedEntities, createSortedTable, entryOf, insertSorted, loadSortedTable, refreshWatchedTree, relocateSorted,
    releaseSortedTable, removeSorted, sameStoredKey, unwatchSortedComponent, watchSortedComponent, type SortedTable,
} from './index-sorted.js';
import { compareObjects } from './index-keys.js';

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
    readonly words: number;
    readonly unique: boolean;
    /** By archetype id: 1 when it holds that archetype's entities, 2 when not, 0 until checked; and those it holds. */
    member: Int8Array;
    readonly members: Archetype[];
    /** The journal position it read up to, or -1 before it's built; the tick it was last refreshed at. */
    position: number;
    refreshed: number;
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
    const index: WorldIndex = {
        definition,
        label: labelOfItem(definition),
        users: 1,
        keys,
        has: (components?.has ?? []).map(component => idOf(state, component)),
        not: (components?.not ?? []).map(component => idOf(state, component)),
        parts,
        words,
        unique: unique === true,
        member: new Int8Array(16),
        members: [],
        position: -1,
        refreshed: 0,
        watchers: new Map(),
        scanned: new Map(),
        hash: definition.declaration.sorted === true ? null : createHashTable(state.memory, words),
        sorted: definition.declaration.sorted === true ? createSortedTable(state.memory, words, parts) : null,
        key: new Uint32Array(Math.max(1, words)),
        stamps: new Int32Array(0),
        pass: 0,
        pending: new Int32Array(64),
        pendingArchetypes: new Int32Array(64),
        pendingRows: new Int32Array(64),
        operations: new Int32Array(64),
        inserted: new Int32Array(64),
        built: { entries: new Int32Array(0), keys: new Uint32Array(0), hashes: new Uint32Array(0), buckets: new Int32Array(0), order: new Int32Array(0), spare: new Int32Array(0), histogram: new Int32Array(definition.declaration.sorted === true ? 65536 : 0) },
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
        let holds = !archetype.resource;
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
    if (index.parts.some(part => part.kind === "object")) holdWords(index, hash.records, bucket * hash.stride + recordKey, hold);
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
export const refreshUses = (state: State, uses: readonly IndexUse[]): void => {
    for (let k = 0; k < uses.length; k++) refreshIndex(state, uses[k].index, uses[k].watching, state.indexFailures);
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
export const refreshIndex = (state: State, index: WorldIndex, watching: readonly number[], failures: Failure[]): void => {
    const { journal } = state;
    const end = journalEnd(journal);
    const since = index.refreshed;
    const tick = state.tick;
    let keyed = false;
    for (let k = 0; k < index.keys.length && !keyed; k++) keyed = writtenSince(state, index.keys[k], since);
    if (index.position < 0 || index.position < journal.first) rebuild(state, index, tick, failures);
    else if (index.position !== end || keyed) refresh(state, index, end, keyed, tick, failures);
    index.position = end;
    index.refreshed = tick;
    for (let k = 0; k < watching.length; k++) scanWatched(state, index, watching[k], tick);
};

/** Patches an index for the entities the journal lists from its position to `end` and, when `keyed`, those whose key changed. */
const refresh = (state: State, index: WorldIndex, end: number, keyed: boolean, tick: number, failures: Failure[]): void => {
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
    // Past what a patch takes, by the rows of the chunks that changed, it's built again without listing them.
    const most = Math.max(rebuildMinimum, sizeOf(index) / 8);
    if (end - index.position > most || (keyed && changedEstimate(state, index, most - (end - index.position)))) {
        rebuild(state, index, tick, failures);
        return;
    }
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
                if (marking) changedRows(archetype, storage, since, row => { count = pend(index, rows[row] >>> 0, id, row, count); });
                else changedRows(archetype, storage, since, row => { count = list(index, rows[row] >>> 0, id, row, count); });
            }
        }
    }
    if (count === 0) return;
    if (count > most) {
        rebuild(state, index, tick, failures);
        return;
    }
    if (index.hash !== null) patch(state, index, index.hash, count, tick, failures);
    else if (index.sorted !== null) patchSorted(state, index, index.sorted, count, tick, failures);
};

/** Whether the rows of member archetypes' chunks whose key parts changed since the last refresh are more than `most`. */
const changedEstimate = (state: State, index: WorldIndex, most: number): boolean => {
    const since = index.refreshed;
    let rows = 0;
    for (const archetype of index.members) {
        for (const part of index.keys) {
            const storage = archetype.storageById[part];
            if (storage === undefined || !storage.ticked || !writtenSince(state, part, since)) continue;
            if (storage.columnChanged > since) rows += archetype.count;
            else {
                const { chunkChanged } = storage;
                for (let chunk = 0, count = Math.ceil(archetype.count / 2 ** chunkShift); chunk < count; chunk++) {
                    if (chunkChanged[chunk] > since) rows += Math.min(2 ** chunkShift, archetype.count - (chunk << chunkShift));
                }
            }
            if (rows > most) return true;
        }
    }
    return false;
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
        const fresh = unknownValue(index, key);
        if (fresh) encodeRow(index, archetype, row, key, 0, true);
        const bucket = bucketFor(hash, key, 0, hashWords(key, 0, words), tick);
        if (bucket === old) {
            relocate(hash, bucket, entity, archetypeId, row);
            continue;
        }
        if (!fresh) holdKey(hash, index, bucket, true);
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
            continue;
        }
        const archetype = state.archetypes[archetypeId];
        const row = scanned >= 0 ? pendingRows[k] : entities.row[entity];
        encodeRow(index, archetype, row, key, 0, false);
        const fresh = unknownValue(index, key);
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
    const order: number[] = [];
    for (let k = 0; k < count; k++) order.push(k);
    order.sort((a, b) => operations[4 * a] - operations[4 * b] || operations[4 * a + 1] - operations[4 * b + 1]);
    const removed = new Int32Array(count);
    const added = new Int32Array(count * entryWords);
    let scratch = new Int32Array(0);
    for (let start = 0; start < count;) {
        const bucket = operations[4 * order[start]];
        let end = start + 1;
        while (end < count && operations[4 * order[end]] === bucket) end++;
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

/** An index a runner looks up through, with the components its lookups there watch. */
export type IndexUse = { readonly index: WorldIndex; readonly watching: readonly number[] };

/** The indexes a declaration's lookups go through, acquired for one user: by lookup name, as uses, and their release. */
export type IndexLookups = {
    readonly byName: ReadonlyMap<string, WorldIndex>;
    readonly uses: readonly IndexUse[];
    readonly release: () => void;
};

const noUses: readonly IndexUse[] = [];
const noIndexes: ReadonlyMap<string, WorldIndex> = new Map();
/** What a declaration without lookups through indexes acquires. */
const noLookups: IndexLookups = { byName: noIndexes, uses: noUses, release: () => {} };

/** Acquires the indexes a declaration's lookups go through, watching what they watch, once each per index. */
export const acquireLookups = (state: State, lookup: { readonly [name: string]: Lookup } | undefined): IndexLookups => {
    if (lookup === undefined) return noLookups;
    const byName = new Map<string, WorldIndex>();
    const watching = new Map<WorldIndex, Set<number>>();
    for (const name in lookup) {
        const found = indexOfLookup(lookup[name]);
        if (found === undefined) continue;
        let index = byName.size === 0 ? undefined : [...watching.keys()].find(other => other.definition === found);
        if (index === undefined) {
            index = acquireIndex(state, found);
            watching.set(index, new Set());
        }
        byName.set(name, index);
        const declared = lookup[name];
        for (const key of "changed" in declared ? declared.changed ?? [] : []) watching.get(index)?.add(idOf(state, key));
    }
    if (byName.size === 0) return noLookups;
    const uses = [...watching].map(([index, components]): IndexUse => {
        for (const component of components) watchIndex(state, index, component);
        return { index, watching: [...components] };
    });
    let released = false;
    return {
        byName,
        uses,
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
