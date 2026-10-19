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
    bucketFor, coverEntities, createHashTable, entryWords, insertEntry, loadHashTable, mergeEntries, relocate, releaseHashTable,
    removeEntry, tidyHashTable, unwatchHashComponent, watchHashComponent, type HashTable,
} from './index-hash.js';
import { idOf, observe, startTicking, type State } from './state.js';

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
    readonly hash: HashTable;
    /** Scratch: a key's words, by entity index the pass that last saw it, and the entity indexes a refresh goes over. */
    readonly key: Uint32Array;
    stamps: Int32Array;
    pass: number;
    pending: Int32Array;
    /** What an incremental refresh changes, by bucket: removals' entity indexes and insertions' entries. */
    operations: Int32Array;
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
        hash: createHashTable(state.memory, words),
        key: new Uint32Array(Math.max(1, words)),
        stamps: new Int32Array(0),
        pass: 0,
        pending: new Int32Array(64),
        operations: new Int32Array(64),
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
    releaseHashTable(index.hash);
};

/** Counts one more lookup watching a component, whose changes then stamp the buckets holding its rows. */
export const watchIndex = (state: State, index: WorldIndex, component: number): void => {
    const count = index.watchers.get(component) ?? 0;
    index.watchers.set(component, count + 1);
    if (count > 0) return;
    watchHashComponent(index.hash, component, state.tick);
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
    unwatchHashComponent(index.hash, component);
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

/** Each object part's value in bucket `bucket`'s key, interned once more (`retain`) or once less (`release`). */
const holdKey = (index: WorldIndex, bucket: number, hold: boolean): void => {
    const { keys, words } = index.hash;
    for (const part of index.parts) {
        if (part.kind !== "object") continue;
        const id = keys[bucket * words + part.first];
        if (hold) retain(part, id);
        else releaseInterned(part, id);
    }
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
const conflict = (state: State, index: WorldIndex, bucket: number, inserted: number, failures: Failure[]): void => {
    const { entries, starts } = index.hash;
    const first = starts[bucket] * entryWords;
    const kept = entityOf(state, entries, first);
    const other = entries[first] === inserted ? entityOf(state, entries, first + entryWords) : state.archetypes[state.entities.archetype[inserted]].entities[state.entities.row[inserted]];
    const key = keyText(state, index, state.archetypes[entries[first + 1]], entries[first + 2]);
    failures.push({
        kind: "index",
        name: index.label,
        message: `Index "${index.label}" is unique, and entities ${kept} and ${other} both have key ${key}; lookups give ${kept}, the one with the lower entity index.`,
        stack: null,
    });
};

/** Grows a scratch array of entity indexes to at least `length`, keeping its contents. */
const fit = (array: Int32Array, length: number): Int32Array => {
    if (array.length >= length) return array;
    const grown = new Int32Array(Math.max(length, 2 * array.length));
    grown.set(array);
    return grown;
};

/** Adds an entity index to a refresh's pending ones, once. */
const pend = (index: WorldIndex, entity: number, count: number): number => {
    if (index.stamps[entity] === index.pass) return count;
    index.stamps[entity] = index.pass;
    if (count === index.pending.length) index.pending = fit(index.pending, count + 1);
    index.pending[count] = entity;
    return count + 1;
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
    if (index.stamps.length < entities.length) {
        const grown = new Int32Array(Math.max(entities.length, 2 * index.stamps.length));
        grown.set(index.stamps);
        index.stamps = grown;
    }
    index.pass++;
    let count = 0;
    for (let at = index.position; at < end; at++) count = pend(index, journal.indexes[at - journal.first], count);
    if (keyed) {
        const since = index.refreshed;
        for (const archetype of index.members) {
            const rows = archetype.entities;
            for (const id of index.keys) {
                const storage = archetype.storageById[id];
                if (storage === undefined || !storage.ticked || !writtenSince(state, id, since)) continue;
                changedRows(archetype, storage, since, row => { count = pend(index, rows[row] >>> 0, count); });
            }
        }
    }
    if (count === 0) return;
    if (count > Math.max(rebuildMinimum, index.hash.size / 8)) {
        rebuild(state, index, tick, failures);
        return;
    }
    patch(state, index, count, tick, failures);
};

/** Inserts or removes a pending entity's entries, so each bucket changes once, in entity order. */
const patch = (state: State, index: WorldIndex, count: number, tick: number, failures: Failure[]): void => {
    const { hash, pending, key, words } = index;
    const { entities } = state;
    coverEntities(hash, entities.length);
    // Each operation: bucket, entity index, archetype id or -1 for a removal, row.
    let operations = 0;
    const operate = (bucket: number, entity: number, archetype: number, row: number): void => {
        if (4 * (operations + 1) > index.operations.length) index.operations = fit(index.operations, 4 * (operations + 1));
        const at = 4 * operations++;
        index.operations[at] = bucket;
        index.operations[at + 1] = entity;
        index.operations[at + 2] = archetype;
        index.operations[at + 3] = row;
    };
    for (let k = 0; k < count; k++) {
        const entity = pending[k];
        const archetypeId = entity < entities.length ? entities.archetype[entity] : -1;
        const old = hash.bucketOf[entity];
        if (archetypeId < 0 || index.member[archetypeId] !== 1) {
            if (old < 0) continue;
            operate(old, entity, -1, 0);
            holdKey(index, old, false);
            hash.bucketOf[entity] = -1;
            continue;
        }
        const archetype = state.archetypes[archetypeId];
        const row = entities.row[entity];
        encodeRow(index, archetype, row, key, 0, false);
        // A value nothing held is interned now, once for this entry, with the rest of its key.
        const fresh = unknownValue(index, key);
        if (fresh) encodeRow(index, archetype, row, key, 0, true);
        const bucket = bucketFor(hash, key, 0, hashWords(key, 0, words), tick);
        if (bucket === old) {
            relocate(hash, bucket, entity, archetypeId, row);
            continue;
        }
        if (!fresh) holdKey(index, bucket, true);
        if (old >= 0) {
            operate(old, entity, -1, 0);
            holdKey(index, old, false);
        }
        operate(bucket, entity, archetypeId, row);
        hash.bucketOf[entity] = bucket;
    }
    applyOperations(state, index, operations, tick, failures);
    tidyHashTable(hash, tick);
};

/** Operations of one bucket at most this many apply one at a time; more merge in one pass. */
const mergeMinimum = 8;

/** Applies a patch's operations, grouped by bucket, removals before insertions, each bucket's in entity order. */
const applyOperations = (state: State, index: WorldIndex, count: number, tick: number, failures: Failure[]): void => {
    const { hash } = index;
    const operations = index.operations;
    if (count <= mergeMinimum) {
        for (let k = 0; k < count; k++) if (operations[4 * k + 2] < 0) removeEntry(hash, operations[4 * k], operations[4 * k + 1], tick);
        for (let k = 0; k < count; k++) {
            const at = 4 * k;
            if (operations[at + 2] < 0) continue;
            const bucket = operations[at];
            insertEntry(hash, bucket, operations[at + 1], operations[at + 2], operations[at + 3], tick);
            if (index.unique && hash.lengths[bucket] > 1) conflict(state, index, bucket, operations[at + 1], failures);
        }
        return;
    }
    // Operations by bucket, then entity index.
    const order = new Int32Array(count);
    for (let k = 0; k < count; k++) order[k] = k;
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
        if (end - start <= mergeMinimum) {
            for (let r = 0; r < removals; r++) removeEntry(hash, bucket, removed[r], tick);
            for (let a = 0; a < insertions; a++) insertEntry(hash, bucket, added[a * entryWords], added[a * entryWords + 1], added[a * entryWords + 2], tick);
        }
        else {
            const length = hash.lengths[bucket] * entryWords;
            if (scratch.length < length) scratch = new Int32Array(Math.max(length, 2 * scratch.length));
            mergeEntries(hash, bucket, removed, removals, added, insertions, scratch, tick);
        }
        if (index.unique && hash.lengths[bucket] > 1) for (let a = 0; a < insertions; a++) conflict(state, index, bucket, added[a * entryWords], failures);
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
    const listed = new Int32Array(total * entryWords);
    const keys = new Uint32Array(Math.max(1, total * words));
    const hashes = new Uint32Array(total);
    let count = 0;
    const add = (entity: number): void => {
        const archetypeId = entities.archetype[entity];
        const archetype = state.archetypes[archetypeId];
        const row = entities.row[entity];
        listed[count * entryWords] = entity;
        listed[count * entryWords + 1] = archetypeId;
        listed[count * entryWords + 2] = row;
        encodeRow(index, archetype, row, keys, count * words, true);
        hashes[count] = hashWords(keys, count * words, words);
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
    loadHashTable(index.hash, count, listed, keys, hashes, tick, entities.length);
    for (const component of index.scanned.keys()) index.scanned.set(component, tick);
    if (!index.unique) return;
    const { hash } = index;
    for (let bucket = 0; bucket < hash.count; bucket++) {
        const length = hash.lengths[bucket];
        for (let k = 1; k < length; k++) conflict(state, index, bucket, hash.entries[(hash.starts[bucket] + k) * entryWords], failures);
    }
};

/** Stamps the buckets holding rows whose watched component changed since it was last read, with `tick`. */
const scanWatched = (state: State, index: WorldIndex, component: number, tick: number): void => {
    const since = index.scanned.get(component) ?? tick;
    if (!writtenSince(state, component, since)) return;
    const ticks = index.hash.watched.get(component);
    if (ticks === undefined) return;
    const { bucketOf } = index.hash;
    for (const archetype of index.members) {
        const storage = archetype.storageById[component];
        if (storage === undefined || !storage.ticked) continue;
        const rows = archetype.entities;
        changedRows(archetype, storage, since, row => {
            const bucket = bucketOf[rows[row] >>> 0];
            if (bucket >= 0) ticks[bucket] = tick;
        });
    }
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

/** Acquires the indexes a declaration's lookups go through, watching what they watch, once each per index. */
export const acquireLookups = (state: State, lookup: { readonly [name: string]: Lookup } | undefined): IndexLookups => {
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
    if (byName.size === 0) return { byName: noIndexes, uses: noUses, release: () => {} };
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
