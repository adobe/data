// © 2026 Adobe. MIT License. See /LICENSE for details.
import { declaresTrait } from '../../interface/registry/names.js';
import { indexOf } from './entities.js';
import { chunkShift } from './kernel.js';
import type { State } from './state.js';

/**
 * Whether a component or resource declaring one of `traits` changed since a tick, on any thread: written, by its
 * stamps, which joined threads' systems write in shared memory too; added, by its added stamps; or gone from an entity,
 * by fewer rows holding it than when it was last asked. The world's keys declaring them are found as it meets them, and
 * their ticks start, with kernels' stamps, at the next run.
 */
export const traitChanges = (state: State, traits: readonly symbol[]): ((since: number) => boolean) => {
    const ids: number[] = [];
    /** By id among `ids`, the rows holding it when last asked, -1 before. */
    const counts: number[] = [];
    let tested = 0;
    const follow = (): void => {
        for (const { keys } = state; tested < keys.length; tested++) {
            if (!declaresTrait(keys[tested], traits)) continue;
            ids.push(tested);
            counts.push(-1);
            if (!state.observed.has(tested)) state.watchesPending.push(tested);
        }
    };
    const resourceChanged = (id: number, since: number): boolean => {
        if (state.resourceEntity < 0) return false;
        const index = indexOf(state.resourceEntity);
        const storage = state.archetypes[state.entities.archetype[index]]?.storageById[id];
        return storage !== undefined && storage.ticked && storage.changed[state.entities.row[index]] > since;
    };
    /** Whether a storage's rows were stamped added or changed after `since`. */
    const stamped = (id: number, since: number): { changed: boolean; rows: number } => {
        let rows = 0;
        let changed = false;
        const { archetypes } = state;
        for (let k = 0; k < archetypes.length; k++) {
            const archetype = archetypes[k];
            const storage = archetype.storageById[id];
            if (storage === undefined || archetype.resource || archetype.count === 0) continue;
            rows += archetype.count;
            if (changed || !storage.ticked) continue;
            if (storage.columnChanged > since) {
                changed = true;
                continue;
            }
            const { chunkAdded, chunkChanged } = storage;
            for (let chunk = 0, last = (archetype.count - 1) >> chunkShift; chunk <= last && !changed; chunk++) {
                if (chunkChanged[chunk] > since || chunkAdded[chunk] > since) changed = true;
            }
        }
        return { changed, rows };
    };
    return since => {
        follow();
        let changed = false;
        for (let k = 0; k < ids.length; k++) {
            const id = ids[k];
            if (state.resources.has(id)) {
                if (!changed && resourceChanged(id, since)) changed = true;
                continue;
            }
            const found = stamped(id, since);
            if (found.changed || found.rows !== counts[k]) changed = true;
            counts[k] = found.rows;
        }
        return changed;
    };
};
