import { allocateArray, freeArray } from './arrays.js';
import type { Memory } from './memory.js';

/**
 * An `up` system's rows in run order: groups by depth, then archetype, `matches[groupOwners[k]]`, then parents'
 * archetype, `groupParents[k]`, or -1 without a parent with every component `up` reads. Group `k` is slots
 * `groupStarts[k]` to `groupEnds[k] - 1`; slot `n` is row `rows[n]` of its archetype, entity index `entities[n]`,
 * whose parent is row `parents[n]`. Within a group, rows are in storage order. Depth `d`'s groups are
 * `depthGroups[d]` to `depthGroups[d + 1] - 1`. Slots between groups are unused, up to `size`.
 */
export type Order = {
    readonly rows: Int32Array;
    readonly parents: Int32Array;
    readonly entities: Int32Array;
    readonly size: number;
    readonly groups: number;
    readonly groupStarts: Int32Array;
    readonly groupEnds: Int32Array;
    readonly groupDepths: Int32Array;
    readonly groupOwners: Int32Array;
    readonly groupParents: Int32Array;
    readonly depthGroups: Int32Array;
    readonly levels: number;
};

/** Spare slots a group gets when laid out: an eighth of its rows, at least this many. */
const slack = 8;

/** Grows an array to at least `length`, keeping its contents and filling the rest with `value`. */
const extend = (array: Int32Array<ArrayBuffer>, length: number, value: number): Int32Array<ArrayBuffer> => {
    if (array.length >= length) return array;
    const grown = new Int32Array(Math.max(length, 2 * array.length));
    grown.set(array);
    grown.fill(value, array.length);
    return grown;
};

/**
 * The slots of an `up` order, kept in segments of one buffer, one per group, each with spare slots, so a change
 * patches one group: a row moves within its group by binary search and a shift. Rows and parents' rows are in the
 * arena, so WASM kernels and the GPU can address them.
 */
export const createOrder = (memory: Memory) => {
    let rows: Int32Array = new Int32Array(0);
    let parents: Int32Array = new Int32Array(0);
    let entities = new Int32Array(0);
    let size = 0;
    let live = 0;
    /** By group id: its first slot, rows, spare slots included, depth, archetype and parents' archetype. */
    let starts = new Int32Array(0);
    let lengths = new Int32Array(0);
    let capacities = new Int32Array(0);
    let depths = new Int32Array(0);
    let owners = new Int32Array(0);
    let parentKeys = new Int32Array(0);
    let groups = 0;
    /** Group ids in run order. */
    let sorted = new Int32Array(0);
    const byKey = new Map<string, number>();
    /** By entity index: its group, or -1, and its row there. */
    let groupOf = new Int32Array(0);
    let rowOf = new Int32Array(0);
    let view: Order | null = null;

    /** Grows the slot arrays to `length`, keeping their contents. */
    const reserve = (length: number): void => {
        if (rows.length >= length) return;
        const capacity = Math.max(length, 2 * rows.length);
        const grownRows = allocateArray(memory, Int32Array, capacity);
        const grownParents = allocateArray(memory, Int32Array, capacity);
        grownRows.set(rows.subarray(0, size));
        grownParents.set(parents.subarray(0, size));
        if (rows.length > 0) {
            freeArray(memory, rows);
            freeArray(memory, parents);
        }
        rows = grownRows;
        parents = grownParents;
        entities = extend(entities, capacity, 0);
    };

    const growGroups = (): void => {
        if (starts.length > groups) return;
        const capacity = Math.max(16, 2 * starts.length);
        starts = extend(starts, capacity, 0);
        lengths = extend(lengths, capacity, 0);
        capacities = extend(capacities, capacity, 0);
        depths = extend(depths, capacity, 0);
        owners = extend(owners, capacity, 0);
        parentKeys = extend(parentKeys, capacity, 0);
        sorted = extend(sorted, capacity, 0);
    };

    const keyOf = (depth: number, owner: number, parent: number): string => `${depth} ${owner} ${parent}`;

    /** Whether group `a` runs before group `b`. */
    const before = (a: number, b: number): boolean =>
        depths[a] !== depths[b] ? depths[a] < depths[b] : owners[a] !== owners[b] ? owners[a] < owners[b] : parentKeys[a] < parentKeys[b];

    /** A new, empty group with `capacity` slots at the end of the buffer, placed in run order. */
    const addGroup = (depth: number, owner: number, parent: number, capacity: number): number => {
        growGroups();
        const id = groups++;
        depths[id] = depth;
        owners[id] = owner;
        parentKeys[id] = parent;
        lengths[id] = 0;
        reserve(size + capacity);
        starts[id] = size;
        capacities[id] = capacity;
        size += capacity;
        let at = id;
        while (at > 0 && before(id, sorted[at - 1])) {
            sorted[at] = sorted[at - 1];
            at--;
        }
        sorted[at] = id;
        byKey.set(keyOf(depth, owner, parent), id);
        return id;
    };

    /** Moves a full group to the end of the buffer with twice the slots. */
    const relocate = (id: number): void => {
        const capacity = 2 * capacities[id] + slack;
        reserve(size + capacity);
        const from = starts[id];
        rows.copyWithin(size, from, from + lengths[id]);
        parents.copyWithin(size, from, from + lengths[id]);
        entities.copyWithin(size, from, from + lengths[id]);
        starts[id] = size;
        capacities[id] = capacity;
        size += capacity;
    };

    /** The slot of `index` in its group, found by its row. */
    const slotOf = (id: number, index: number): number => {
        const row = rowOf[index];
        let low = starts[id];
        let high = low + lengths[id];
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (rows[middle] < row) low = middle + 1;
            else high = middle;
        }
        // Rows are unique within a group once removals are done; an insertion pending may share one meanwhile.
        while (entities[low] !== index) low++;
        return low;
    };

    const grow = (length: number): void => {
        groupOf = extend(groupOf, length, -1);
        rowOf = extend(rowOf, length, 0);
    };

    /** Removes an entity's slot, if it has one. */
    const remove = (index: number): void => {
        const id = index < groupOf.length ? groupOf[index] : -1;
        if (id < 0) return;
        const slot = slotOf(id, index);
        const end = starts[id] + lengths[id];
        rows.copyWithin(slot, slot + 1, end);
        parents.copyWithin(slot, slot + 1, end);
        entities.copyWithin(slot, slot + 1, end);
        lengths[id]--;
        live--;
        groupOf[index] = -1;
        view = null;
    };

    /** Places an entity's row in its group, in storage order. */
    const insert = (index: number, depth: number, owner: number, parent: number, row: number, parentRow: number): void => {
        grow(index + 1);
        const id = byKey.get(keyOf(depth, owner, parent)) ?? addGroup(depth, owner, parent, slack);
        if (lengths[id] === capacities[id]) relocate(id);
        const start = starts[id];
        const end = start + lengths[id];
        let low = start;
        let high = end;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (rows[middle] < row) low = middle + 1;
            else high = middle;
        }
        rows.copyWithin(low + 1, low, end);
        parents.copyWithin(low + 1, low, end);
        entities.copyWithin(low + 1, low, end);
        rows[low] = row;
        parents[low] = parentRow;
        entities[low] = index;
        lengths[id]++;
        live++;
        groupOf[index] = id;
        rowOf[index] = row;
        view = null;
    };

    /** Whether an entity's slot is in the group of this depth, archetype and parents' archetype, at this row. */
    const isAt = (index: number, depth: number, owner: number, parent: number, row: number): boolean => {
        const id = index < groupOf.length ? groupOf[index] : -1;
        return id >= 0 && rowOf[index] === row && depths[id] === depth && owners[id] === owner && parentKeys[id] === parent;
    };

    /** Sets an entity's parent's row, in place. */
    const setParent = (index: number, parentRow: number): void => {
        const id = groupOf[index];
        parents[slotOf(id, index)] = parentRow;
    };

    /** Lays the groups out again in run order, each with spare slots, dropping empty ones. */
    const compact = (): void => {
        const kept: number[] = [];
        let total = 0;
        for (let k = 0; k < groups; k++) {
            const id = sorted[k];
            if (lengths[id] === 0) continue;
            kept.push(id);
            total += lengths[id] + spareFor(lengths[id]);
        }
        const toRows = allocateArray(memory, Int32Array, Math.max(total, 1));
        const toParents = allocateArray(memory, Int32Array, Math.max(total, 1));
        const toEntities = new Int32Array(Math.max(total, 1));
        const toStarts = new Int32Array(Math.max(16, kept.length));
        const toLengths = new Int32Array(toStarts.length);
        const toCapacities = new Int32Array(toStarts.length);
        const toDepths = new Int32Array(toStarts.length);
        const toOwners = new Int32Array(toStarts.length);
        const toParentKeys = new Int32Array(toStarts.length);
        byKey.clear();
        let at = 0;
        kept.forEach((id, k) => {
            const from = starts[id];
            const length = lengths[id];
            toRows.set(rows.subarray(from, from + length), at);
            toParents.set(parents.subarray(from, from + length), at);
            toEntities.set(entities.subarray(from, from + length), at);
            for (let slot = at; slot < at + length; slot++) groupOf[toEntities[slot]] = k;
            toStarts[k] = at;
            toLengths[k] = length;
            toCapacities[k] = length + spareFor(length);
            toDepths[k] = depths[id];
            toOwners[k] = owners[id];
            toParentKeys[k] = parentKeys[id];
            byKey.set(keyOf(depths[id], owners[id], parentKeys[id]), k);
            at += toCapacities[k];
        });
        if (rows.length > 0) {
            freeArray(memory, rows);
            freeArray(memory, parents);
        }
        rows = toRows;
        parents = toParents;
        entities = toEntities;
        starts = toStarts;
        lengths = toLengths;
        capacities = toCapacities;
        depths = toDepths;
        owners = toOwners;
        parentKeys = toParentKeys;
        groups = kept.length;
        sorted = new Int32Array(starts.length);
        for (let k = 0; k < groups; k++) sorted[k] = k;
        size = at;
        view = null;
    };

    /** Spare slots for a group of `length` rows. */
    const spareFor = (length: number): number => Math.max(slack, length >> 3);

    /**
     * Replaces every slot with groups laid out in run order, each with spare slots: slots `ends[k - 1]` (or 0) to
     * `ends[k] - 1` of the given arrays are group `k`, of `groupDepths[k]`, `groupOwners[k]` and `groupParents[k]`.
     */
    const load = (count: number, groupRows: Int32Array, groupParentRows: Int32Array, groupEntities: Int32Array, ends: Int32Array, groupDepths: Int32Array, groupOwners: Int32Array, groupParents: Int32Array, entityCount: number): void => {
        const total = count === 0 ? 0 : ends[count - 1];
        groups = 0;
        size = 0;
        byKey.clear();
        reserve(total + count * slack + (total >> 3));
        grow(entityCount);
        groupOf.fill(-1);
        const toRows = rows, toParents = parents, toEntities = entities, entityGroups = groupOf, entityRows = rowOf;
        for (let k = 0; k < count; k++) {
            growGroups();
            const id = groups++;
            const from = k === 0 ? 0 : ends[k - 1];
            const length = ends[k] - from;
            starts[id] = size;
            lengths[id] = length;
            capacities[id] = length + spareFor(length);
            depths[id] = groupDepths[k];
            owners[id] = groupOwners[k];
            parentKeys[id] = groupParents[k];
            sorted[id] = id;
            byKey.set(keyOf(groupDepths[k], groupOwners[k], groupParents[k]), id);
            toRows.set(groupRows.subarray(from, ends[k]), size);
            toParents.set(groupParentRows.subarray(from, ends[k]), size);
            toEntities.set(groupEntities.subarray(from, ends[k]), size);
            for (let n = from; n < ends[k]; n++) {
                entityGroups[groupEntities[n]] = id;
                entityRows[groupEntities[n]] = groupRows[n];
            }
            size += capacities[id];
        }
        live = total;
        view = null;
    };

    /** Compacts once unused slots outnumber the rows. */
    const tidy = (): void => {
        if (size > 2 * live + 1024) compact();
    };

    /** The order as runs read it; a new object after any change, so the GPU knows to upload it again. */
    const current = (): Order => {
        if (view !== null) return view;
        const groupStarts = new Int32Array(groups);
        const groupEnds = new Int32Array(groups);
        const groupDepths = new Int32Array(groups);
        const groupOwners = new Int32Array(groups);
        const groupParents = new Int32Array(groups);
        let levels = 0;
        for (let k = 0; k < groups; k++) {
            const id = sorted[k];
            groupStarts[k] = starts[id];
            groupEnds[k] = starts[id] + lengths[id];
            groupDepths[k] = depths[id];
            groupOwners[k] = owners[id];
            groupParents[k] = parentKeys[id];
            levels = depths[id] + 1;
        }
        const depthGroups = new Int32Array(levels + 1);
        for (let k = 0, depth = 0; depth <= levels; depth++) {
            while (k < groups && groupDepths[k] < depth) k++;
            depthGroups[depth] = k;
        }
        view = { rows, parents, entities, size, groups, groupStarts, groupEnds, groupDepths, groupOwners, groupParents, depthGroups, levels };
        return view;
    };

    return { load, insert, remove, isAt, setParent, tidy, current, live: () => live };
};
