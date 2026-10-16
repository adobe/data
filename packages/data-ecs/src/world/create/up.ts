import type { Entity } from '../../entity/entity.js';
import type { Up } from '../../system/access.js';
import type { Archetype, Storage } from './archetype.js';
import { readCell } from './cells.js';
import type { TypedArray } from '../../layout/layout.js';
import { generationOf, indexOf } from './entities.js';
import { chunkShift } from './kernel.js';
import { idOf, type Key, type State } from './state.js';

/**
 * Matched rows in depth order, by their index among the matched rows: `rows` from `ends[d - 1]` (or 0) to `ends[d]`
 * are depth `d`, in storage order. Row `g` is row `g - bases[archetype.id]` of `matches[owners[g]]`.
 */
export type Order = { readonly rows: Int32Array; readonly ends: Int32Array; readonly levels: number; readonly owners: Int32Array; readonly bases: Int32Array };

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
                    continue;
                }
                const parentArchetype = archetypeOf[index];
                const parentRow = rowOf[index];
                parentArchetypes[self] = parentArchetype;
                parentRows[self] = parentRow;
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
        for (const archetype of matches) for (let row = 0; row < archetype.count; row++) {
            const self = archetype.entities[row] >>> 0;
            if (parentArchetypes[self] >= 0) childStarts[parentEntities[self] + 1]++;
        }
        for (let index = 1; index <= entities.length; index++) childStarts[index] += childStarts[index - 1];
        const placed = childStarts.slice(0, entities.length);
        for (const archetype of matches) for (let row = 0; row < archetype.count; row++) {
            const self = archetype.entities[row] >>> 0;
            if (parentArchetypes[self] >= 0) children[placed[parentEntities[self]]++] = bases[archetype.id] + row;
        }
        const parentIds = new Set<number>();
        for (const archetype of matches) for (let row = 0; row < archetype.count; row++) {
            const parent = parentArchetypes[archetype.entities[row] >>> 0];
            if (parent >= 0) parentIds.add(parent);
        }
        parentArchetypeIds = [...parentIds];
        // After placing, each depth's count is where the next depth starts.
        return { rows: order, ends: counts, levels: deepest + 1, owners, bases };
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

    /** The parent of the row with this entity, when it has `up` values. */
    const readableParent = (entity: Entity): Archetype | null => {
        const parentArchetype = parentArchetypes[indexOf(entity)];
        return parentArchetype >= 0 && isReadable(parentArchetype) ? state.archetypes[parentArchetype] : null;
    };

    /** By archetype id: each `read` component's scalar view, stride and offset, or a null view to read it whole; kept while its arrays are. */
    const scalars: ({ readonly version: number; readonly views: readonly (TypedArray | null)[]; readonly strides: Int32Array; readonly offsets: Int32Array } | undefined)[] = [];
    const scalarsOf = (archetype: Archetype) => {
        const cached = scalars[archetype.id];
        if (cached !== undefined && cached.version === archetype.version) return cached;
        const strides = new Int32Array(read.length);
        const offsets = new Int32Array(read.length);
        const views = read.map((component, k) => {
            const storage = archetype.storageById[component];
            const layout = storage?.layout;
            if (storage === undefined || layout?.kind !== "linear" || layout.leaves.length !== 1 || layout.leaves[0].path.length !== 0 || layout.leaves[0].scalar === "boolean") return null;
            strides[k] = layout.leaves[0].unitStride;
            offsets[k] = layout.leaves[0].unitOffset;
            return storage.views[layout.leaves[0].view];
        });
        const fresh = { version: archetype.version, views, strides, offsets };
        scalars[archetype.id] = fresh;
        return fresh;
    };

    const values: unknown[] = new Array(read.length);
    /** For a kernel: the parent's `read` values, in order, in one array reused for every row, or null. */
    const kernelLookup = (entity: Entity): readonly unknown[] | null => {
        const parent = readableParent(entity);
        if (parent === null) return null;
        const row = parentRows[indexOf(entity)];
        const { views, strides, offsets } = scalarsOf(parent);
        for (let k = 0; k < read.length; k++) {
            const view = views[k];
            if (view !== null) values[k] = view[row * strides[k] + offsets[k]];
            else {
                const storage = parent.storageById[read[k]];
                values[k] = storage === undefined ? undefined : readCell(storage, row);
            }
        }
        return values;
    };

    /** For a main-thread body: the parent's `read` values by component, or null. */
    const objectLookup = (entity: Entity): object | null => {
        const parent = readableParent(entity);
        if (parent === null) return null;
        const row = parentRows[indexOf(entity)];
        const result: { [key: Key]: unknown } = {};
        for (let k = 0; k < read.length; k++) {
            const storage = parent.storageById[read[k]];
            result[readKeys[k]] = storage === undefined ? undefined : readCell(storage, row);
        }
        return result;
    };

    return { levels, anyChanged, parentChanged, seed, markChildren, kernelLookup, objectLookup };
};
