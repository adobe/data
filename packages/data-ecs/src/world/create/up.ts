import type { Up } from '../../system/access.js';
import type { Archetype } from './archetype.js';
import { readCell } from './cells.js';
import type { Entity } from '../../entity/entity.js';
import { asEntity, locate } from './entities.js';
import { idOf, type State } from './state.js';

/** Rows of one depth, in storage order: runs of consecutive rows of one archetype. */
export type Level = readonly { readonly archetype: Archetype; readonly start: number; readonly end: number }[];

const unknownDepth = -1;
const visiting = -2;
/** On a parent cycle, or under one: never run. */
const cyclic = -3;

/**
 * Orders an `up` system's rows by depth through its `through` reference. A row's depth is one more than its parent's
 * when its parent is among the matched rows, and 0 otherwise, so rows of one depth never read each other's writes.
 */
export const createUp = (state: State, up: Up) => {
    const through = idOf(state, up.through);
    const read = (up.read ?? []).map(key => idOf(state, key));
    let parents = new Int32Array(0);
    let depths = new Int32Array(0);
    let owners = new Int32Array(0);
    let counts = new Int32Array(0);
    let order = new Int32Array(0);
    const stack: number[] = [];

    /** The entity a row's `through` names, or -1 without one. */
    const parentEntityOf = (archetype: Archetype, row: number): number => {
        const storage = archetype.storageById[through];
        if (storage === undefined) return -1;
        const parent = readCell(storage, row);
        return typeof parent === "number" ? parent : -1;
    };

    /** The live entity a row's `through` names, as its index in the entity table, or -1. */
    const parentIndexOf = (archetype: Archetype, row: number): number => {
        const parent = parentEntityOf(archetype, row);
        return parent < 0 ? -1 : locate(state.entities, parent);
    };

    /** The matched rows, level by level from the roots. Rows on or under a parent cycle are in none. */
    const levels = (matches: readonly Archetype[]): readonly Level[] => {
        const bases = new Map<Archetype, number>();
        let count = 0;
        for (const archetype of matches) {
            bases.set(archetype, count);
            count += archetype.count;
        }
        if (parents.length < count) {
            parents = new Int32Array(count);
            depths = new Int32Array(count);
            owners = new Int32Array(count);
            order = new Int32Array(count);
        }
        matches.forEach((archetype, a) => {
            const base = bases.get(archetype) ?? 0;
            for (let row = 0; row < archetype.count; row++) {
                const index = parentIndexOf(archetype, row);
                const parentBase = index < 0 ? undefined : bases.get(state.archetypes[state.entities.archetype[index]]);
                parents[base + row] = parentBase === undefined ? -1 : parentBase + state.entities.row[index];
                owners[base + row] = a;
            }
        });
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
        if (counts.length < deepest + 2) counts = new Int32Array(deepest + 2);
        counts.fill(0, 0, deepest + 2);
        for (let row = 0; row < count; row++) if (depths[row] >= 0) counts[depths[row] + 1]++;
        for (let depth = 1; depth <= deepest + 1; depth++) counts[depth] += counts[depth - 1];
        const ends = counts.slice(1, deepest + 2);
        for (let row = 0; row < count; row++) if (depths[row] >= 0) order[counts[depths[row]]++] = row;
        const result: Level[] = [];
        let first = 0;
        for (let depth = 0; depth <= deepest; depth++) {
            const level: { archetype: Archetype; start: number; end: number }[] = [];
            for (let k = first; k < ends[depth]; k++) {
                const row = order[k];
                const archetype = matches[owners[row]];
                const local = row - (bases.get(archetype) ?? 0);
                const last = level[level.length - 1];
                if (last !== undefined && last.archetype === archetype && last.end === local) last.end++;
                else level.push({ archetype, start: local, end: local + 1 });
            }
            first = ends[depth];
            result.push(level);
        }
        return result;
    };

    /**
     * Whether a row's parent may have changed after `since`: its parent reference or what it reads of its parent
     * changed, or the row moved to another archetype, as removing its parent reference moves it.
     */
    const parentChanged = (archetype: Archetype, row: number, since: number): boolean => {
        const self = locate(state.entities, archetype.entities[row] ?? 0);
        if (self >= 0 && state.entities.moved[self] > since) return true;
        const storage = archetype.storageById[through];
        if (storage === undefined) return false;
        if ((storage.added[row] ?? 0) > since || (storage.changed[row] ?? 0) > since) return true;
        const index = parentIndexOf(archetype, row);
        if (index < 0) return false;
        const parent = state.archetypes[state.entities.archetype[index]];
        const parentRow = state.entities.row[index];
        for (const id of read) {
            const values = parent?.storageById[id];
            if (values !== undefined && ((values.changed[parentRow] ?? 0) > since || values.columnChanged > since)) return true;
        }
        return false;
    };

    /** For a kernel, which looks `up` up by its row's entity: the parent's values through `lookup`, or null. */
    const lookupBy = <T>(lookup: (entity: Entity) => T | null) => (entity: Entity): T | null => {
        const index = locate(state.entities, entity);
        if (index < 0) return null;
        const archetype = state.archetypes[state.entities.archetype[index]];
        const parent = archetype === undefined ? -1 : parentEntityOf(archetype, state.entities.row[index]);
        return parent < 0 ? null : lookup(asEntity(parent));
    };

    return { levels, parentEntityOf, parentChanged, lookupBy };
};
