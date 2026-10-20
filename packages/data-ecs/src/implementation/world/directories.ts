import { allocateArray, freeArray } from './arrays.js';
import type { State } from './state.js';

/**
 * A lookup's directory for WASM kernels: per archetype id, a match flag, then for a lookup through an index the address
 * of the archetype's entities, then the column address of each component the lookup reads, then the `changed` tick
 * column address of each it watches, 0 for one keeping no ticks. It lives in shared memory, so workers read the same
 * one. Rebuilt at sync points when archetypes are created or grow, or start ticks, since all change those addresses.
 */
export type Directory = {
    readonly entities: boolean;
    readonly read: readonly number[];
    readonly watched: readonly number[];
    readonly has: readonly number[];
    readonly not: readonly number[];
    records: Int32Array;
    /** Archetypes described. */
    count: number;
    /** The layout it was built for: archetype count plus every archetype's version. */
    built: number;
};

const words = (directory: Directory): number => 1 + (directory.entities ? 1 : 0) + directory.read.length + directory.watched.length;

const layoutOf = (state: State): number => {
    let layout = state.archetypes.length;
    for (const archetype of state.archetypes) layout += archetype.version;
    return layout;
};

/** Rebuilds a directory if archetypes changed since it was built. Allocates, so it runs only at sync points or registration. */
export const refreshDirectory = (state: State, directory: Directory, layout = layoutOf(state)): void => {
    if (directory.built === layout) return;
    const length = state.archetypes.length * words(directory);
    if (directory.records.length < length) {
        freeArray(state.memory, directory.records);
        directory.records = allocateArray(state.memory, Int32Array, Math.max(length, directory.records.length * 2));
    }
    const { records, read, has, not, watched } = directory;
    state.archetypes.forEach((archetype, id) => {
        const base = id * words(directory);
        const { storageById } = archetype;
        const matches = !archetype.resource && [...read, ...has].every(component => storageById[component] !== undefined) && not.every(component => storageById[component] === undefined);
        records[base] = matches ? 1 : 0;
        const first = directory.entities ? 2 : 1;
        if (directory.entities) records[base + 1] = matches ? archetype.entities.byteOffset : 0;
        read.forEach((component, i) => {
            const storage = storageById[component];
            records[base + first + i] = matches && storage !== undefined ? storage.views.u8.byteOffset : 0;
        });
        watched.forEach((component, i) => {
            const storage = storageById[component];
            records[base + first + read.length + i] = matches && storage !== undefined && storage.ticked ? storage.changed.byteOffset : 0;
        });
    });
    directory.count = state.archetypes.length;
    directory.built = layout;
};

export const createDirectory = (state: State, read: readonly number[], has: readonly number[], not: readonly number[], entities = false, watched: readonly number[] = []): Directory => {
    const directory: Directory = { entities, read, watched, has, not, records: allocateArray(state.memory, Int32Array, 16), count: 0, built: -1 };
    state.directories.add(directory);
    refreshDirectory(state, directory);
    return directory;
};

/** Stops keeping a directory, freeing its records, once no kernel looks up through it again. */
export const releaseDirectory = (state: State, directory: Directory): void => {
    if (!state.directories.delete(directory)) return;
    freeArray(state.memory, directory.records);
};

/** At a sync point: brings every directory up to date with the archetypes. */
export const refreshDirectories = (state: State): void => {
    if (state.directories.size === 0) return;
    const layout = layoutOf(state);
    for (const directory of state.directories) refreshDirectory(state, directory, layout);
};

/** What a WASM kernel with lookups takes, in its lookup parameters: the entity table, then each directory. */
export const lookupParameters = (state: State, directories: readonly Directory[]): number[] => {
    const { entities } = state;
    const parameters = [entities.archetype.byteOffset, entities.row.byteOffset, entities.generation.byteOffset, entities.length];
    for (const directory of directories) parameters.push(directory.records.byteOffset, directory.count);
    return parameters;
};
