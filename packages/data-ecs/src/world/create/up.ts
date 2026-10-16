import type { Up } from '../../system/access.js';
import type { Archetype, Storage } from './archetype.js';
import { readCell } from './cells.js';
import { generationOf, indexOf } from './entities.js';
import { chunkShift } from './kernel.js';
import { idOf, type Key, type State } from './state.js';

/**
 * Matched rows in groups, run in order: each group's rows share a depth, an archetype, `matches[groupOwners[k]]`, and
 * their parents' archetype, `groupParents[k]`, or -1 without a parent with every component `up` reads. Group `k` is
 * slots `groupEnds[k - 1]` (or 0) to `groupEnds[k]`; slot `n` is row `rows[n]` of its archetype, whose parent is row
 * `parents[n]`, and row `globals[n]` among the matched rows. Within a group, rows are in storage order.
 */
export type Order = {
    readonly rows: Int32Array;
    readonly parents: Int32Array;
    readonly globals: Int32Array;
    readonly groups: number;
    readonly groupEnds: Int32Array;
    readonly groupOwners: Int32Array;
    readonly groupParents: Int32Array;
};

const unknownDepth = -1;
const visiting = -2;
/** On a parent cycle, or under one: never run. */
const cyclic = -3;

/** Grows an array to at least `length`, without keeping its contents. */
const fit = (array: Int32Array<ArrayBuffer>, length: number): Int32Array<ArrayBuffer> => array.length >= length ? array : new Int32Array(Math.max(length, 2 * array.length));

/**
 * Orders an `up` system's rows by depth through its `through` reference. A row's depth is one more than its parent's
 * when its parent is among the matched rows, and 0 otherwise, so rows of one depth never read each other's writes.
 * `levels` also records each row's parent by entity index, which the lookups and change checks read until the next run.
 */
export const createUp = (state: State, up: Up) => {
    const through = idOf(state, up.through);
    const readKeys: readonly Key[] = up.read ?? [];
    const read = readKeys.map(key => idOf(state, key));
    /** By entity index, for the rows of the current run: the parent's archetype id, or -1 without one, and its row. */
    let parentArchetypes = new Int32Array(0);
    let parentRows = new Int32Array(0);
    /** By entity index: the parent's entity index. */
    let parentEntities = new Int32Array(0);
    /** The children of entity index `e` are `children[childStarts[e]]` to `children[childStarts[e + 1] - 1]`. */
    let childStarts = new Int32Array(0);
    let children = new Int32Array(0);
    let slotRows = new Int32Array(0);
    let slotParents = new Int32Array(0);
    let slotGlobals = new Int32Array(0);
    /** By index among the matched rows: the parent's row, its entity index or -1, and its archetype id when readable or -1. */
    let rowParents = new Int32Array(0);
    let rowParentEntities = new Int32Array(0);
    let keys = new Int32Array(0);
    let placed = new Int32Array(0);
    /** By archetype id: whether some row's parent is in it. */
    let parentSeen = new Uint8Array(0);
    let groupEnds = new Int32Array(0);
    let groupOwners = new Int32Array(0);
    let groupParents = new Int32Array(0);
    /** By archetype id: the first index of its rows among the matched rows, or -1 when it doesn't match. */
    let bases = new Int32Array(0);
    /** By archetype id: 1 when it has every component `read` lists, 2 when it doesn't, 0 until checked. */
    let readable = new Int8Array(0);
    let parents = new Int32Array(0);
    let depths = new Int32Array(0);
    let owners = new Int32Array(0);
    let order = new Int32Array(0);
    let counts = new Int32Array(0);
    const stack: number[] = [];

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

    /** The order of the last call, kept while no sync point applies commands, since only those move rows. */
    let kept: { readonly structures: number; readonly matches: number; readonly order: Order } | null = null;

    /** The matched rows in depth order from the roots. Rows on or under a parent cycle are in none. */
    const levels = (matches: readonly Archetype[]): Order => {
        if (kept !== null && kept.structures === state.structures && kept.matches === matches.length) return kept.order;
        const result = orderOf(matches);
        kept = { structures: state.structures, matches: matches.length, order: result };
        return result;
    };

    const orderOf = (matches: readonly Archetype[]): Order => {
        const { entities } = state;
        if (parentArchetypes.length < entities.length) {
            parentArchetypes = fit(parentArchetypes, entities.length);
            parentRows = fit(parentRows, entities.length);
            parentEntities = fit(parentEntities, entities.length);
        }
        bases = fit(bases, state.archetypes.length);
        bases.fill(-1, 0, state.archetypes.length);
        let count = 0;
        for (const archetype of matches) {
            bases[archetype.id] = count;
            count += archetype.count;
        }
        parents = fit(parents, count);
        rowParents = fit(rowParents, count);
        rowParentEntities = fit(rowParentEntities, count);
        keys = fit(keys, count);
        if (parentSeen.length < state.archetypes.length) parentSeen = new Uint8Array(Math.max(state.archetypes.length, 2 * parentSeen.length));
        parentSeen.fill(0);
        depths = fit(depths, count);
        owners = fit(owners, count);
        order = fit(order, count);
        const { archetype: archetypeOf, row: rowOf, generation, length } = entities;
        for (let a = 0; a < matches.length; a++) {
            const archetype = matches[a];
            const base = bases[archetype.id];
            const rows = archetype.entities;
            owners.fill(a, base, base + archetype.count);
            const storage: Storage | undefined = archetype.storageById[through];
            const layout = storage?.layout;
            // An entity is one f64, read straight from its column.
            const leaf = layout?.kind === "linear" ? layout.leaves[0] : undefined;
            const view = storage === undefined || leaf === undefined ? undefined : storage.views[leaf.view];
            const stride = leaf?.unitStride ?? 0;
            const offset = leaf?.unitOffset ?? 0;
            for (let row = 0; row < archetype.count; row++) {
                const self = rows[row] >>> 0;
                const parent = view === undefined ? 0 : view[row * stride + offset];
                const index = parent >>> 0;
                if (parent <= 0 || index >= length || archetypeOf[index] < 0 || generation[index] !== generationOf(parent)) {
                    parentArchetypes[self] = -1;
                    parents[base + row] = -1;
                    rowParentEntities[base + row] = -1;
                    keys[base + row] = -1;
                    continue;
                }
                const parentArchetype = archetypeOf[index];
                const parentRow = rowOf[index];
                parentArchetypes[self] = parentArchetype;
                parentRows[self] = parentRow;
                rowParents[base + row] = parentRow;
                rowParentEntities[base + row] = index;
                keys[base + row] = isReadable(parentArchetype) ? parentArchetype : -1;
                parentSeen[parentArchetype] = 1;
                parentEntities[self] = index;
                const parentBase = bases[parentArchetype];
                parents[base + row] = parentBase < 0 ? -1 : parentBase + parentRow;
            }
        }
        depths.fill(unknownDepth, 0, count);
        let deepest = -1;
        for (let start = 0; start < count; start++) {
            if (depths[start] !== unknownDepth) continue;
            let current = start;
            while (current >= 0 && depths[current] === unknownDepth) {
                depths[current] = visiting;
                stack.push(current);
                current = parents[current];
            }
            let depth = current < 0 ? -1 : depths[current];
            const onCycle = depth === visiting || depth === cyclic;
            while (stack.length > 0) {
                const row = stack.pop() ?? 0;
                depths[row] = onCycle ? cyclic : ++depth;
            }
            if (!onCycle) deepest = Math.max(deepest, depth);
        }
        // A counting sort by depth keeps storage order within each depth.
        counts = fit(counts, deepest + 2);
        counts.fill(0, 0, deepest + 2);
        for (let row = 0; row < count; row++) if (depths[row] >= 0) counts[depths[row] + 1]++;
        for (let depth = 1; depth <= deepest + 1; depth++) counts[depth] += counts[depth - 1];
        for (let row = 0; row < count; row++) if (depths[row] >= 0) order[counts[depths[row]]++] = row;
        // Children by parent entity index, as indexes among the matched rows, for pushing changes down.
        children = fit(children, count);
        if (childStarts.length < entities.length + 1) childStarts = new Int32Array(Math.max(entities.length + 1, 2 * childStarts.length));
        childStarts.fill(0, 0, entities.length + 1);
        for (let row = 0; row < count; row++) if (rowParentEntities[row] >= 0) childStarts[rowParentEntities[row] + 1]++;
        for (let index = 1; index <= entities.length; index++) childStarts[index] += childStarts[index - 1];
        placed = fit(placed, entities.length);
        placed.set(childStarts.subarray(0, entities.length));
        for (let row = 0; row < count; row++) if (rowParentEntities[row] >= 0) children[placed[rowParentEntities[row]]++] = row;
        const parentIds: number[] = [];
        for (let id = 0; id < state.archetypes.length; id++) if (parentSeen[id] === 1) parentIds.push(id);
        parentArchetypeIds = parentIds;
        // Within each depth and archetype, which `order` already keeps together, rows are grouped by their parents'
        // archetype, stably, so a kernel call binds one parent archetype's columns.
        const total = counts[deepest] ?? 0;
        slotRows = fit(slotRows, total);
        slotParents = fit(slotParents, total);
        slotGlobals = fit(slotGlobals, total);
        groupEnds = fit(groupEnds, total);
        groupOwners = fit(groupOwners, total);
        groupParents = fit(groupParents, total);
        let groups = 0;
        const place = (slot: number, global: number, base: number): void => {
            slotRows[slot] = global - base;
            slotGlobals[slot] = global;
            slotParents[slot] = rowParents[global];
        };
        let depthStart = 0;
        for (let depth = 0; depth <= deepest; depth++) {
            const depthEnd = counts[depth];
            for (let start = depthStart; start < depthEnd;) {
                const owner = owners[order[start]];
                const base = bases[matches[owner].id];
                const first = keys[order[start]];
                let end = start + 1;
                let uniform = true;
                for (; end < depthEnd && owners[order[end]] === owner; end++) if (keys[order[end]] !== first) uniform = false;
                if (uniform) {
                    for (let k = start; k < end; k++) place(k, order[k], base);
                    groupEnds[groups] = end;
                    groupOwners[groups] = owner;
                    groupParents[groups++] = first;
                }
                else {
                    let slot = start;
                    const parentKeys = [...new Set(order.subarray(start, end).map(global => keys[global]))].sort((a, b) => a - b);
                    for (const parentKey of parentKeys) {
                        for (let k = start; k < end; k++) if (keys[order[k]] === parentKey) place(slot++, order[k], base);
                        groupEnds[groups] = slot;
                        groupOwners[groups] = owner;
                        groupParents[groups++] = parentKey;
                    }
                }
                start = end;
            }
            depthStart = depthEnd;
        }
        return { rows: slotRows, parents: slotParents, globals: slotGlobals, groups, groupEnds, groupOwners, groupParents };
    };

    /** By archetype id: whether some matched row's parent is in it, from the last order. */
    let parentArchetypeIds: readonly number[] = [];

    /** Whether a chunk of any of these components' ticks in an archetype is newer than `since`. */
    const newer = (archetype: Archetype, components: readonly number[], since: number): boolean => {
        for (const id of components) {
            const storage = archetype.storageById[id];
            if (storage === undefined) continue;
            if (storage.columnChanged > since) return true;
            const { chunkAdded, chunkChanged } = storage;
            for (let k = 0; k < chunkChanged.length; k++) if (chunkChanged[k] > since || chunkAdded[k] > since) return true;
        }
        return false;
    };

    /**
     * Whether any row may pass after `since`, by chunk ticks alone: some matched archetype's `filters` or parent
     * reference, or what is read of parents, changed, or some entity moved.
     */
    const anyChanged = (matches: readonly Archetype[], filters: readonly number[], since: number): boolean => {
        if (state.entities.lastMove > since) return true;
        for (const archetype of matches) if (newer(archetype, filters, since) || newer(archetype, [through], since)) return true;
        for (const id of parentArchetypeIds) if (newer(state.archetypes[id], read, since)) return true;
        return false;
    };

    /** Marks the children of the entity at `index` dirty. */
    const markChildren = (index: number, dirty: Uint8Array): void => {
        for (let k = childStarts[index], end = childStarts[index + 1]; k < end; k++) dirty[children[k]] = 1;
    };

    /** Marks rows whose ticks of these components are newer than `since`, chunk by chunk, calling `mark` for each. */
    const changedRows = (archetype: Archetype, components: readonly number[], since: number, mark: (row: number) => void): void => {
        for (const id of components) {
            const storage = archetype.storageById[id];
            if (storage === undefined) continue;
            const whole = storage.columnChanged > since;
            const { chunkAdded, chunkChanged, added, changed } = storage;
            for (let chunk = 0, chunks = Math.ceil(archetype.count / 2 ** chunkShift); chunk < chunks; chunk++) {
                if (!whole && !(chunkChanged[chunk] > since) && !(chunkAdded[chunk] > since)) continue;
                for (let row = chunk << chunkShift, end = Math.min(archetype.count, (chunk + 1) << chunkShift); row < end; row++) {
                    if (whole || changed[row] > since || added[row] > since) mark(row);
                }
            }
        }
    };

    /**
     * Marks the rows that may pass after `since` without a moved entity: those whose `filters` or parent reference
     * changed, and the children of parents whose `read` values changed. Rows that run mark their children as they go.
     */
    const seed = (matches: readonly Archetype[], filters: readonly number[], since: number, dirty: Uint8Array): void => {
        for (const archetype of matches) {
            const base = bases[archetype.id];
            changedRows(archetype, [...filters, through], since, row => { dirty[base + row] = 1; });
        }
        for (const id of parentArchetypeIds) {
            const archetype = state.archetypes[id];
            changedRows(archetype, read, since, row => markChildren(archetype.entities[row] >>> 0, dirty));
        }
    };

    /**
     * Whether a row's parent may have changed after `since`: its parent reference or what it reads of its parent
     * changed, or the row moved to another archetype, as removing its parent reference moves it.
     */
    const parentChanged = (archetype: Archetype, row: number, since: number): boolean => {
        const self = indexOf(archetype.entities[row]);
        if (state.entities.moved[self] > since) return true;
        const storage = archetype.storageById[through];
        if (storage === undefined) return false;
        if (storage.added[row] > since || storage.changed[row] > since) return true;
        const parentArchetype = parentArchetypes[self];
        if (parentArchetype < 0) return false;
        const parent = state.archetypes[parentArchetype];
        const parentRow = parentRows[self];
        for (let k = 0; k < read.length; k++) {
            const values = parent.storageById[read[k]];
            if (values !== undefined && (values.changed[parentRow] > since || values.columnChanged > since)) return true;
        }
        return false;
    };

    /** For a main-thread body: the `read` values of the parent at a row of an archetype, by component, or null without one. */
    const objectLookup = (parentArchetype: number, row: number): object | null => {
        if (parentArchetype < 0) return null;
        const parent = state.archetypes[parentArchetype];
        const result: { [key: Key]: unknown } = {};
        for (let k = 0; k < read.length; k++) {
            const storage = parent.storageById[read[k]];
            result[readKeys[k]] = storage === undefined ? undefined : readCell(storage, row);
        }
        return result;
    };

    return { levels, anyChanged, parentChanged, seed, markChildren, objectLookup };
};
