import type { Up } from '../../system/access.js';
import type { Archetype, Storage } from './archetype.js';
import { generationOf, indexOf } from './entities.js';
import { journalEnd } from './journal.js';
import { chunkShift } from './kernel.js';
import { idOf, type Key, type State } from './state.js';
import { allocateArray, freeArray } from './arrays.js';
import type { Memory } from './memory.js';

/**
 * Matched rows in groups, run in order: each group's rows share a depth, an archetype, `matches[groupOwners[k]]`, and
 * their parents' archetype, `groupParents[k]`, or -1 without a parent with every component `up` reads. Group `k` is
 * slots `groupEnds[k - 1]` (or 0) to `groupEnds[k]`; slot `n` is row `rows[n]` of its archetype, whose parent is row
 * `parents[n]`. Within a group, rows are in storage order. Depth `d`'s groups start at `depthGroups[d]`.
 */
export type Order = {
    readonly rows: Int32Array;
    readonly parents: Int32Array;
    readonly groups: number;
    readonly groupEnds: Int32Array;
    readonly groupDepths: Int32Array;
    readonly groupOwners: Int32Array;
    readonly groupParents: Int32Array;
    readonly depthGroups: Int32Array;
    readonly levels: number;
};

/** Rows `rows[start]` to `rows[end - 1]` of `matches[owner]`, whose parents are rows `parents[n]` of the archetype with id `parent`, or -1. */
export type Run = { readonly owner: number; readonly parent: number; readonly rows: Int32Array; readonly parents: Int32Array; readonly start: number; readonly end: number };

/** A filtered run's rows, a depth at a time: each call lists the next depth's rows that run, or null after the last. */
export type Pass = { readonly next: () => readonly Run[] | null; readonly clear: () => void };

/** `levelOf` values: not matched, and on or under a parent cycle, which never runs. Matched rows hold depth + 1. */
const unmatched = 0;
const cyclic = -1;
/** A depth with more marked rows than this share of the matched rows is listed by scanning its groups in order. */
const denseShare = 1 / 8;
/** Rows below this many are sorted rather than scanned. */
const denseMinimum = 4096;
/** Sort keys pack a row with its parent's archetype: `(parent + 1) * rowLimit + row`. */
const rowLimit = 2 ** 27;

/** Grows an array in the arena to at least `length`, without keeping its contents, so WASM can address it. */
const fitArena = (memory: Memory, array: Int32Array, length: number): Int32Array => {
    if (array.length >= length) return array;
    if (array.length > 0) freeArray(memory, array);
    return allocateArray(memory, Int32Array, Math.max(length, 2 * array.length));
};

/** Grows an array to at least `length`, without keeping its contents. */
const fit = (array: Int32Array<ArrayBuffer>, length: number): Int32Array<ArrayBuffer> => array.length >= length ? array : new Int32Array(Math.max(length, 2 * array.length));

/** Grows an array to at least `length`, keeping its contents and filling the rest with `value`. */
const extend = (array: Int32Array<ArrayBuffer>, length: number, value: number): Int32Array<ArrayBuffer> => {
    if (array.length >= length) return array;
    const grown = new Int32Array(Math.max(length, 2 * array.length));
    grown.set(array);
    grown.fill(value, array.length);
    return grown;
};

/**
 * Orders an `up` system's rows by depth through its `through` reference. A row's depth is one more than its parent's
 * when its parent is among the matched rows, and 0 otherwise, so rows of one depth never read each other's writes.
 *
 * The tree is kept by entity index, current with the journal of what sync points changed: each matched entity's
 * parent, its level, and the matched entities holding it as their parent, as linked lists. A full run reads an order
 * of every row, rebuilt from the tree only after rows of its archetypes changed. A filtered run marks the rows that
 * may pass, by depth, and lists only those.
 */
export const createUp = (state: State, up: Up, isFiltered: boolean) => {
    const through = idOf(state, up.through);
    const readKeys: readonly Key[] = up.read ?? [];
    const read = readKeys.map(key => idOf(state, key));
    state.journal.readers++;

    /** By entity index: the parent's entity index or -1, the level, and the first child, next and previous sibling as index + 1, or 0. */
    let parentOf = new Int32Array(0);
    let levelOf = new Int32Array(0);
    let firstChild = new Int32Array(0);
    let nextChild = new Int32Array(0);
    let previousChild = new Int32Array(0);
    /** By entity index: the pass that last saw it, for settling levels and reading the journal once per index. */
    let stamps = new Int32Array(0);
    let pass = 0;
    /** The journal's position read up to, or -1 before the tree is first built. */
    let position = -1;
    /** By archetype id: its index in `matches`, or -1. */
    let ownerOf = new Int32Array(0);
    let ownersOf: readonly Archetype[] | null = null;
    let ownersFor = -1;
    let ownersAmong = -1;
    /** By archetype id: 1 when it has every component `read` lists, 2 when it doesn't, 0 until checked. */
    let readable = new Int8Array(0);
    /** Entities whose parent changed since the last filtered run, which then pass. */
    let touched: number[] = [];
    /** Whether the journal lost entries since the last filtered run, which then runs every row. */
    let rebuilt = false;
    /** Whether levels or parents changed since the order was built. */
    let stale = true;

    /** Whether an archetype holds every component `read` lists, so a parent in it has `up` values. */
    const isReadable = (id: number): boolean => {
        if (readable.length <= id) {
            const grown = new Int8Array(Math.max(id + 1, 2 * readable.length));
            grown.set(readable);
            readable = grown;
        }
        if (readable[id] === 0) {
            const archetype = state.archetypes[id];
            readable[id] = archetype !== undefined && !archetype.resource && read.every(component => archetype.storageById[component] !== undefined) ? 1 : 2;
        }
        return readable[id] === 1;
    };

    const refreshOwners = (matches: readonly Archetype[]): void => {
        if (ownersOf === matches && ownersFor === matches.length && ownersAmong === state.archetypes.length) return;
        ownerOf = fit(ownerOf, state.archetypes.length);
        ownerOf.fill(-1);
        matches.forEach((archetype, owner) => { ownerOf[archetype.id] = owner; });
        ownersOf = matches;
        ownersFor = matches.length;
        ownersAmong = state.archetypes.length;
    };

    /** The entity index of an entity's live parent, or -1. */
    const parentAt = (index: number): number => {
        const { entities } = state;
        const archetype = state.archetypes[entities.archetype[index]];
        const storage: Storage | undefined = archetype.storageById[through];
        const layout = storage?.layout;
        // An entity is one f64, read straight from its column.
        const leaf = layout?.kind === "linear" ? layout.leaves[0] : undefined;
        if (storage === undefined || leaf === undefined) return -1;
        const parent = storage.views[leaf.view][entities.row[index] * leaf.unitStride + leaf.unitOffset];
        const target = parent >>> 0;
        if (parent <= 0 || target >= entities.length || entities.archetype[target] < 0 || entities.generation[target] !== generationOf(parent)) return -1;
        return target;
    };

    const isMatched = (index: number): boolean => {
        const archetype = state.entities.archetype[index];
        return archetype >= 0 && ownerOf[archetype] >= 0;
    };

    const unlink = (index: number): void => {
        const parent = parentOf[index];
        if (parent < 0) return;
        const previous = previousChild[index];
        const next = nextChild[index];
        if (previous !== 0) nextChild[previous - 1] = next;
        else firstChild[parent] = next;
        if (next !== 0) previousChild[next - 1] = previous;
    };

    const link = (index: number, parent: number): void => {
        parentOf[index] = parent;
        if (parent < 0) return;
        const first = firstChild[parent];
        nextChild[index] = first;
        previousChild[index] = 0;
        if (first !== 0) previousChild[first - 1] = index + 1;
        firstChild[parent] = index + 1;
    };

    /** Grows the arrays by entity index to the entity table. */
    const grow = (): void => {
        const length = state.entities.length;
        if (parentOf.length >= length) return;
        parentOf = extend(parentOf, length, -1);
        levelOf = extend(levelOf, length, unmatched);
        firstChild = extend(firstChild, length, 0);
        nextChild = extend(nextChild, length, 0);
        previousChild = extend(previousChild, length, 0);
        stamps = extend(stamps, length, 0);
    };

    let stack = new Int32Array(0);
    let queue = new Int32Array(0);

    /**
     * Sets the levels of the matched entities among `pending`, and of each descendant whose level changes as a result.
     * Each walks up through pending ancestors to one whose level is known, so a cycle is found where a walk meets itself.
     */
    const settle = (pending: readonly number[] | Int32Array, count: number): void => {
        const waiting = ++pass;
        const visiting = ++pass;
        const settled = ++pass;
        for (let k = 0; k < count; k++) if (levelOf[pending[k]] !== unmatched) stamps[pending[k]] = waiting;
        let queued = 0;
        const descend = (index: number): void => {
            const level = levelOf[index];
            const want = level === cyclic ? cyclic : level + 1;
            for (let child = firstChild[index]; child !== 0; child = nextChild[child - 1]) {
                const c = child - 1;
                if (levelOf[c] === want) {
                    stamps[c] = settled;
                    continue;
                }
                levelOf[c] = want;
                stamps[c] = settled;
                queue = extend(queue, queued + 1, 0);
                queue[queued++] = c;
            }
        };
        for (let k = 0; k < count; k++) {
            const start = pending[k];
            if (stamps[start] !== waiting) continue;
            let height = 0;
            let current = start;
            while (current >= 0 && levelOf[current] !== unmatched && stamps[current] === waiting) {
                stamps[current] = visiting;
                stack = extend(stack, height + 1, 0);
                stack[height++] = current;
                current = parentOf[current];
            }
            let level = current < 0 || levelOf[current] === unmatched ? 0 : stamps[current] === visiting ? cyclic : levelOf[current];
            for (let h = height - 1; h >= 0; h--) {
                level = level === cyclic ? cyclic : level + 1;
                levelOf[stack[h]] = level;
                stamps[stack[h]] = settled;
            }
            for (let h = 0; h < height; h++) descend(stack[h]);
            while (queued > 0) descend(queue[--queued]);
        }
    };

    /** Builds the tree from every matched row. */
    const build = (matches: readonly Archetype[]): void => {
        const length = state.entities.length;
        parentOf.fill(-1, 0, length);
        levelOf.fill(unmatched, 0, length);
        firstChild.fill(0, 0, length);
        let count = 0;
        for (const archetype of matches) count += archetype.count;
        const all = new Int32Array(count);
        let at = 0;
        for (const archetype of matches) {
            for (let row = 0; row < archetype.count; row++) {
                const index = archetype.entities[row] >>> 0;
                levelOf[index] = 1;
                all[at++] = index;
            }
        }
        for (let k = 0; k < count; k++) link(all[k], parentAt(all[k]));
        settle(all, count);
    };

    /** Brings the tree up to date with the journal. */
    const update = (matches: readonly Archetype[]): void => {
        refreshOwners(matches);
        grow();
        const { journal } = state;
        const end = journalEnd(journal);
        if (position === end) return;
        stale = true;
        if (position < journal.first) {
            build(matches);
            position = end;
            rebuilt = isFiltered;
            touched = [];
            return;
        }
        const seen = ++pass;
        const pending: number[] = [];
        for (let at = position; at < end; at++) {
            const index = journal.indexes[at - journal.first];
            if (stamps[index] === seen) continue;
            stamps[index] = seen;
            if (!isMatched(index)) {
                if (levelOf[index] !== unmatched) {
                    unlink(index);
                    parentOf[index] = -1;
                    levelOf[index] = unmatched;
                }
            }
            else {
                const parent = parentAt(index);
                if (levelOf[index] === unmatched) {
                    levelOf[index] = 1;
                    link(index, parent);
                }
                else if (parent !== parentOf[index]) {
                    unlink(index);
                    link(index, parent);
                }
                pending.push(index);
                if (isFiltered) touched.push(index);
            }
            // Its children's parent moved or changed. A child whose reference changed is journaled itself, as is one
            // whose parent is gone, since `through` has a reference policy.
            for (let child = firstChild[index]; child !== 0; child = nextChild[child - 1]) {
                pending.push(child - 1);
                if (isFiltered) touched.push(child - 1);
            }
        }
        position = end;
        settle(pending, pending.length);
    };

    /**
     * The order of the last build, kept until rows of its matched or parents' archetypes change or the tree does, which
     * only sync points do.
     */
    let kept: { readonly matches: number; readonly built: number; readonly watched: readonly Archetype[]; readonly order: Order } | null = null;
    let slotRows: Int32Array = new Int32Array(0);
    let slotParents: Int32Array = new Int32Array(0);
    let groupEnds = new Int32Array(0);
    let groupDepths = new Int32Array(0);
    let groupOwners = new Int32Array(0);
    let groupParents = new Int32Array(0);
    let depthGroups = new Int32Array(0);
    /** By index among the matched rows: its depth, parent row, and parent's archetype id when readable or -1. */
    let depths = new Int32Array(0);
    let rowParents = new Int32Array(0);
    let keys = new Int32Array(0);
    let owners = new Int32Array(0);
    let order = new Int32Array(0);
    let counts = new Int32Array(0);

    const isKept = (matches: readonly Archetype[]): boolean => {
        if (kept === null || stale || kept.matches !== matches.length) return false;
        for (const archetype of kept.watched) if (archetype.rowsChanged > kept.built) return false;
        return true;
    };

    /** The matched rows in depth order from the roots. Rows on or under a parent cycle are in none. */
    const levels = (matches: readonly Archetype[]): Order => {
        update(matches);
        if (kept !== null && isKept(matches)) return kept.order;
        const parentIds = new Set<number>();
        const result = orderOf(matches, parentIds);
        stale = false;
        kept = { matches: matches.length, built: state.tick, watched: [...new Set([...matches, ...[...parentIds].map(id => state.archetypes[id])])], order: result };
        return result;
    };

    const orderOf = (matches: readonly Archetype[], parentIds: Set<number>): Order => {
        const { archetype: archetypeOf, row: rowOf } = state.entities;
        let count = 0;
        for (const archetype of matches) count += archetype.count;
        depths = fit(depths, count);
        rowParents = fit(rowParents, count);
        keys = fit(keys, count);
        owners = fit(owners, count);
        order = fit(order, count);
        let deepest = -1;
        let global = 0;
        for (let a = 0; a < matches.length; a++) {
            const archetype = matches[a];
            const rows = archetype.entities;
            for (let row = 0; row < archetype.count; row++, global++) {
                const index = rows[row] >>> 0;
                const depth = levelOf[index] - 1;
                depths[global] = depth;
                owners[global] = a;
                if (depth > deepest) deepest = depth;
                const parent = parentOf[index];
                if (parent < 0) {
                    keys[global] = -1;
                    continue;
                }
                const parentArchetype = archetypeOf[parent];
                parentIds.add(parentArchetype);
                rowParents[global] = rowOf[parent];
                const known = parentArchetype < readable.length ? readable[parentArchetype] : 0;
                keys[global] = (known === 0 ? isReadable(parentArchetype) : known === 1) ? parentArchetype : -1;
            }
        }
        // A counting sort by depth keeps storage order within each depth.
        counts = fit(counts, deepest + 2);
        counts.fill(0, 0, deepest + 2);
        for (let k = 0; k < count; k++) if (depths[k] >= 0) counts[depths[k] + 1]++;
        for (let depth = 1; depth <= deepest + 1; depth++) counts[depth] += counts[depth - 1];
        for (let k = 0; k < count; k++) if (depths[k] >= 0) order[counts[depths[k]]++] = k;
        // Within each depth and archetype, which `order` already keeps together, rows are grouped by their parents'
        // archetype, stably, so a kernel call binds one parent archetype's columns.
        const total = counts[deepest] ?? 0;
        slotRows = fitArena(state.memory, slotRows, total);
        slotParents = fitArena(state.memory, slotParents, total);
        groupEnds = fit(groupEnds, total);
        groupDepths = fit(groupDepths, total);
        groupOwners = fit(groupOwners, total);
        groupParents = fit(groupParents, total);
        depthGroups = fit(depthGroups, deepest + 2);
        let groups = 0;
        const bases = new Int32Array(matches.length);
        for (let a = 1; a < matches.length; a++) bases[a] = bases[a - 1] + matches[a - 1].count;
        const place = (slot: number, global: number): void => {
            slotRows[slot] = global - bases[owners[global]];
            slotParents[slot] = rowParents[global];
        };
        let depthStart = 0;
        for (let depth = 0; depth <= deepest; depth++) {
            depthGroups[depth] = groups;
            const depthEnd = counts[depth];
            for (let start = depthStart; start < depthEnd;) {
                const owner = owners[order[start]];
                const first = keys[order[start]];
                let end = start + 1;
                let uniform = true;
                for (; end < depthEnd && owners[order[end]] === owner; end++) if (keys[order[end]] !== first) uniform = false;
                if (uniform) {
                    for (let k = start; k < end; k++) place(k, order[k]);
                    groupEnds[groups] = end;
                    groupDepths[groups] = depth;
                    groupOwners[groups] = owner;
                    groupParents[groups++] = first;
                }
                else {
                    let slot = start;
                    const parentKeys = [...new Set(order.subarray(start, end).map(k => keys[k]))].sort((a, b) => a - b);
                    for (const parentKey of parentKeys) {
                        for (let k = start; k < end; k++) if (keys[order[k]] === parentKey) place(slot++, order[k]);
                        groupEnds[groups] = slot;
                        groupDepths[groups] = depth;
                        groupOwners[groups] = owner;
                        groupParents[groups++] = parentKey;
                    }
                }
                start = end;
            }
            depthStart = depthEnd;
        }
        depthGroups[deepest + 1] = groups;
        return { rows: slotRows, parents: slotParents, groups, groupEnds, groupDepths, groupOwners, groupParents, depthGroups, levels: deepest + 1 };
    };

    /** By entity index: whether the current filtered run marked it. */
    let dirty = new Uint8Array(0);
    /** By depth: the entities the current filtered run marked. */
    const buckets: number[][] = [];
    let marked: number[] = [];
    let deepestMarked = -1;
    /** A filtered run's rows and their parents' rows, in the arena so WASM kernels can address them. */
    let list: Int32Array = new Int32Array(0);
    let parentList: Int32Array = new Int32Array(0);
    let sortKeys = new Float64Array(0);

    const mark = (index: number): void => {
        const level = levelOf[index];
        if (level < 1 || dirty[index] !== 0) return;
        dirty[index] = 1;
        marked.push(index);
        (buckets[level - 1] ??= []).push(index);
        if (level - 1 > deepestMarked) deepestMarked = level - 1;
    };

    const markChildren = (index: number): void => {
        for (let child = firstChild[index]; child !== 0; child = nextChild[child - 1]) mark(child - 1);
    };

    /** Calls `each` with every row whose ticks of a component are newer than `since`, by its `added` or `changed` ticks. */
    const changedRows = (archetype: Archetype, id: number, added: boolean, since: number, each: (row: number) => void): void => {
        const storage = archetype.storageById[id];
        if (storage === undefined) return;
        const whole = storage.columnChanged > since;
        const ticks = added ? storage.added : storage.changed;
        const chunks = added ? storage.chunkAdded : storage.chunkChanged;
        for (let chunk = 0, count = Math.ceil(archetype.count / 2 ** chunkShift); chunk < count; chunk++) {
            if (!whole && !(chunks[chunk] > since)) continue;
            for (let row = chunk << chunkShift, end = Math.min(archetype.count, (chunk + 1) << chunkShift); row < end; row++) {
                if (whole || ticks[row] > since) each(row);
            }
        }
    };

    /**
     * Marks the rows of a filtered run that may pass after `since`: those passing `added` or `changed`, whose parent
     * reference changed, whose parent's `read` values changed, or that the journal says moved or changed parent. Returns
     * null when none do. Each listed row marks its children, so a change reaches every row under it.
     */
    const filtered = (matches: readonly Archetype[], added: readonly number[], changed: readonly number[], since: number): Pass | null => {
        update(matches);
        const length = state.entities.length;
        if (dirty.length < length) dirty = new Uint8Array(Math.max(length, 2 * dirty.length));
        for (const bucket of buckets) if (bucket !== undefined) bucket.length = 0;
        marked = [];
        deepestMarked = -1;
        for (const archetype of matches) {
            const { entities } = archetype;
            const markRow = (row: number): void => mark(entities[row] >>> 0);
            if (rebuilt) for (let row = 0; row < archetype.count; row++) markRow(row);
            for (const id of added) changedRows(archetype, id, true, since, markRow);
            for (const id of [...changed, through]) changedRows(archetype, id, false, since, markRow);
        }
        if (read.length > 0) {
            for (const archetype of state.archetypes) {
                if (archetype.count === 0 || !isReadable(archetype.id)) continue;
                const { entities } = archetype;
                for (const id of read) changedRows(archetype, id, false, since, row => markChildren(entities[row] >>> 0));
            }
        }
        for (const index of touched) mark(index);
        touched = [];
        rebuilt = false;
        if (marked.length === 0) return null;
        let matched = 0;
        for (const archetype of matches) matched += archetype.count;
        list = fitArena(state.memory, list, matched);
        parentList = fitArena(state.memory, parentList, matched);
        let listed = 0;
        let depth = 0;
        const { archetype: archetypeOf, row: rowOf } = state.entities;

        /** Lists a depth's marked rows by scanning its groups in order. */
        const scan = (runs: Run[]): void => {
            const ordered = levels(matches);
            if (depth >= ordered.levels) return;
            for (let group = ordered.depthGroups[depth], start = group === 0 ? 0 : ordered.groupEnds[group - 1]; group < ordered.depthGroups[depth + 1]; start = ordered.groupEnds[group++]) {
                const owner = ordered.groupOwners[group];
                const entities = matches[owner].entities;
                const first = listed;
                for (let slot = start; slot < ordered.groupEnds[group]; slot++) {
                    const index = entities[ordered.rows[slot]] >>> 0;
                    if (dirty[index] === 0) continue;
                    markChildren(index);
                    list[listed] = ordered.rows[slot];
                    parentList[listed++] = ordered.parents[slot];
                }
                if (listed > first) runs.push({ owner, parent: ordered.groupParents[group], rows: list, parents: parentList, start: first, end: listed });
            }
        };

        /** Lists a depth's marked rows by sorting them by archetype, parent archetype and row. */
        const sort = (bucket: readonly number[], runs: Run[]): void => {
            const byOwner = new Map<number, number[]>();
            for (const index of bucket) {
                const owner = ownerOf[archetypeOf[index]];
                let entries = byOwner.get(owner);
                if (entries === undefined) byOwner.set(owner, entries = []);
                entries.push(index);
            }
            for (const owner of [...byOwner.keys()].sort((a, b) => a - b)) {
                const entries = byOwner.get(owner) ?? [];
                if (sortKeys.length < entries.length) sortKeys = new Float64Array(Math.max(entries.length, 2 * sortKeys.length));
                const sorting = sortKeys.subarray(0, entries.length);
                for (let k = 0; k < entries.length; k++) {
                    const index = entries[k];
                    const parent = parentOf[index];
                    const key = parent < 0 || !isReadable(archetypeOf[parent]) ? -1 : archetypeOf[parent];
                    sorting[k] = (key + 1) * rowLimit + rowOf[index];
                }
                sorting.sort();
                const entities = matches[owner].entities;
                let first = listed;
                let current = -2;
                for (let k = 0; k < sorting.length; k++) {
                    const key = Math.floor(sorting[k] / rowLimit) - 1;
                    const row = sorting[k] % rowLimit;
                    if (key !== current) {
                        if (listed > first) runs.push({ owner, parent: current, rows: list, parents: parentList, start: first, end: listed });
                        first = listed;
                        current = key;
                    }
                    const index = entities[row] >>> 0;
                    markChildren(index);
                    list[listed] = row;
                    parentList[listed++] = key < 0 ? 0 : rowOf[parentOf[index]];
                }
                if (listed > first) runs.push({ owner, parent: current, rows: list, parents: parentList, start: first, end: listed });
            }
        };

        const next = (): readonly Run[] | null => {
            while (depth <= deepestMarked && (buckets[depth]?.length ?? 0) === 0) depth++;
            if (depth > deepestMarked) return null;
            const bucket = buckets[depth];
            const runs: Run[] = [];
            const dense = bucket.length > Math.max(denseMinimum, matched * denseShare);
            if (dense || matched >= rowLimit) scan(runs);
            else sort(bucket, runs);
            depth++;
            return runs;
        };
        const clear = (): void => {
            for (const index of marked) dirty[index] = 0;
        };
        return { next, clear };
    };

    return { levels, filtered };
};
