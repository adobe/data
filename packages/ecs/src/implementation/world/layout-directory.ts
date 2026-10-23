// © 2026 Adobe. MIT License. See /LICENSE for details.
import { allocateArray, growArray } from './arrays.js';
import type { Archetype } from './archetype.js';
import type { Entities } from './entities.js';
import type { Memory } from './memory.js';

/**
 * Where everything in the shared memory is, for other threads: a header at offset 0 that never moves, a table of
 * archetype record offsets by archetype id, and a record per archetype. Every word is a `Uint32`, since memory reaches
 * 4 GiB. The world's thread keeps its JS fields as the source of truth and writes records only at flushes, each
 * record's version last, with `Atomics.store`; a reader checks a record's version before using what it cached.
 *
 * Header words: the memory's length in pages (`memory.ts`), the table's offset and length, the structure epoch, then
 * the entity-table record: its `cursor` offset, which never moves, `free` offset and capacity, `archetype`, `row` and
 * `generation` offsets and their capacity, and its version; then the resource entity's index plus one, 0 for none. The
 * table's length is `cursor[2]`.
 *
 * The structure epoch is odd from the start of each sync point that applies anything until its directory writes at the
 * end, and even otherwise. A thread reading entity locations outside a task reads while it's even and checks it again
 * after, retrying on a change, and waits on it while it's odd, counted in the waiters word first; the world notifies
 * waiting readers when it turns even.
 */
export const tableOffsetWord = 1;
export const tableLengthWord = 2;
export const structureWord = 3;
export const entitiesWord = 4;
export const cursorField = 0;
export const freeField = 1;
export const freeCapacityField = 2;
export const archetypeField = 3;
export const rowField = 4;
export const generationField = 5;
export const capacityField = 6;
export const entitiesVersionField = 7;
export const resourceEntityWord = 12;
/** Readers waiting on the structure epoch, so the world notifies only when one is. */
export const structureWaitersWord = 13;

/**
 * An archetype record: its capacity, `entities` offset, storage count, version, flags and row count, then per storage
 * its component number, flags, column, `added`, `changed`, `chunkAdded` and `chunkChanged` offsets, chunk count, and
 * `blockAdded` and `blockChanged` offsets, of `chunks << (chunkShift - blockShift)` blocks. Offsets a storage doesn't have are 0. A record is allocated once, since an archetype's storages are fixed, and never
 * moves. Its count is written at flushes while a joined thread may read it, for archetypes whose count changed.
 */
export const recordCapacity = 0;
export const recordEntities = 1;
export const recordStorages = 2;
export const recordVersion = 3;
export const recordFlags = 4;
export const recordCount = 5;
export const recordWords = 6;
/** Record flags: it's the resource archetype, of the entity resources live on. */
export const resourceFlag = 1;
/** Record flags: it holds reports, which only queries that require a component see. */
export const metaFlag = 2;
export const storageWords = 10;
export const storageComponent = 0;
export const storageFlags = 1;
export const storageColumn = 2;
export const storageAdded = 3;
export const storageChanged = 4;
export const storageChunkAdded = 5;
export const storageChunkChanged = 6;
export const storageChunks = 7;
export const storageBlockAdded = 8;
export const storageBlockChanged = 9;
/**
 * Storage flags: it keeps ticks; it has a column in linear memory, a string's of handles included; its objects are a joined thread's, whose number is
 * the flags from `threadShift` on, and its column holds each row's tag (`move-log.ts`).
 */
export const tickedFlag = 1;
export const linearFlag = 2;
export const remoteFlag = 4;
export const threadShift = 8;

/** The world's side of the directory. */
export type LayoutDirectory = {
    readonly memory: Memory;
    readonly header: Uint32Array;
    /** The header as signed words, which `Atomics.notify` takes. */
    readonly words: Int32Array;
    table: Uint32Array;
    /** By archetype id, its record, once flushed. */
    readonly records: (Uint32Array | undefined)[];
    /** The entity table's version as last flushed. */
    entities: number;
    /** Whether a joined thread may read entity locations outside a task, so sync points keep the structure epoch. */
    guarded: boolean;
};

const initialTable = 64;

/** A directory for shared memory; without it, no other thread reads the memory, so there's none. */
export const createLayoutDirectory = (memory: Memory): LayoutDirectory | null => {
    if (!memory.shared) return null;
    const table = allocateArray(memory, Uint32Array, initialTable).fill(0);
    const { header } = memory;
    header[tableOffsetWord] = table.byteOffset;
    header[tableLengthWord] = 0;
    return { memory, header, words: new Int32Array(header.buffer, header.byteOffset, header.length), table, records: [], entities: -1, guarded: false };
};

const writeEntities = ({ header }: LayoutDirectory, entities: Entities): void => {
    header[entitiesWord + cursorField] = entities.cursor.byteOffset;
    header[entitiesWord + freeField] = entities.free.byteOffset;
    header[entitiesWord + freeCapacityField] = entities.free.length;
    header[entitiesWord + archetypeField] = entities.archetype.byteOffset;
    header[entitiesWord + rowField] = entities.row.byteOffset;
    header[entitiesWord + generationField] = entities.generation.byteOffset;
    header[entitiesWord + capacityField] = entities.archetype.length;
    Atomics.store(header, entitiesWord + entitiesVersionField, entities.version);
};

/** The record for an archetype, allocated and entered in the table the first time it's flushed. */
const recordOf = (directory: LayoutDirectory, archetype: Archetype): Uint32Array => {
    const existing = directory.records[archetype.id];
    if (existing !== undefined) return existing;
    const { memory, header } = directory;
    if (archetype.id >= directory.table.length) {
        const used = directory.table.length;
        let length = used * 2;
        while (length <= archetype.id) length *= 2;
        directory.table = growArray(memory, directory.table, Uint32Array, length, used).fill(0, used);
        header[tableOffsetWord] = directory.table.byteOffset;
    }
    const record = allocateArray(memory, Uint32Array, recordWords + archetype.storages.length * storageWords);
    directory.records[archetype.id] = record;
    return record;
};

const writeArchetype = (directory: LayoutDirectory, archetype: Archetype): void => {
    const fresh = directory.records[archetype.id] === undefined;
    const record = recordOf(directory, archetype);
    record[recordCapacity] = archetype.capacity;
    record[recordEntities] = archetype.entities.byteOffset;
    record[recordStorages] = archetype.storages.length;
    record[recordFlags] = (archetype.resource ? resourceFlag : 0) | (archetype.meta ? metaFlag : 0);
    record[recordCount] = archetype.count;
    for (let s = 0; s < archetype.storages.length; s++) {
        const storage = archetype.storages[s];
        const base = recordWords + s * storageWords;
        // A string's column of handles is in linear memory too, its records with it.
        const linear = storage.layout.kind === "linear" || storage.layout.kind === "string";
        const { remote } = storage;
        record[base + storageComponent] = storage.component;
        record[base + storageFlags] = (storage.ticked ? tickedFlag : 0) | (linear ? linearFlag : 0) | (remote === null ? 0 : remoteFlag | (remote.thread << threadShift));
        record[base + storageColumn] = linear ? storage.views.u8.byteOffset : remote === null ? 0 : storage.tags.byteOffset;
        record[base + storageAdded] = storage.ticked ? storage.added.byteOffset : 0;
        record[base + storageChanged] = storage.ticked ? storage.changed.byteOffset : 0;
        record[base + storageChunkAdded] = storage.ticked ? storage.chunkAdded.byteOffset : 0;
        record[base + storageChunkChanged] = storage.ticked ? storage.chunkChanged.byteOffset : 0;
        record[base + storageChunks] = storage.chunkAdded.length;
        record[base + storageBlockAdded] = storage.ticked ? storage.blockAdded.byteOffset : 0;
        record[base + storageBlockChanged] = storage.ticked ? storage.blockChanged.byteOffset : 0;
    }
    Atomics.store(record, recordVersion, archetype.version);
    // Entered once complete, so a reader that finds it finds a whole record.
    if (fresh) directory.table[archetype.id] = record.byteOffset;
};

/**
 * Writes the records of archetypes created or bumped since the last flush, the resource archetype's flagged, and the
 * entity table's and the resource entity's if they moved. Runs at the end of each sync point and wherever registration
 * changes layouts; allocates only for new records.
 */
export const flushDirectory = (directory: LayoutDirectory | null, bumped: Archetype[], archetypes: readonly Archetype[], entities: Entities, resourceEntity: number, counted: Archetype[]): void => {
    if (directory === null) return;
    const resourceWord = resourceEntity < 0 ? 0 : (resourceEntity >>> 0) + 1;
    if (directory.header[resourceEntityWord] !== resourceWord) Atomics.store(directory.header, resourceEntityWord, resourceWord);
    if (counted.length > 0) flushCounts(directory, counted);
    if (bumped.length === 0 && entities.version === directory.entities) return;
    if (entities.version !== directory.entities) {
        writeEntities(directory, entities);
        directory.entities = entities.version;
    }
    if (bumped.length === 0) return;
    for (let k = 0; k < bumped.length; k++) {
        const archetype = bumped[k];
        archetype.listed = false;
        writeArchetype(directory, archetype);
    }
    bumped.length = 0;
    Atomics.store(directory.header, tableLengthWord, archetypes.length);
};

/**
 * A flush between sync points, as registration's: under the structure epoch, as a sync point's is, while a joined
 * thread may read records.
 */
export const flushBetween = (directory: LayoutDirectory | null, bumped: Archetype[], archetypes: readonly Archetype[], entities: Entities, resourceEntity: number, counted: Archetype[]): void => {
    if (directory === null) return;
    const guarding = directory.guarded && (bumped.length > 0 || counted.length > 0 || entities.version !== directory.entities);
    if (guarding) Atomics.add(directory.words, structureWord, 1);
    flushDirectory(directory, bumped, archetypes, entities, resourceEntity, counted);
    if (guarding) endStructure(directory);
};

/** Writes the counts of archetypes whose count changed, those with records; a new archetype's comes with its record. */
const flushCounts = (directory: LayoutDirectory, counted: Archetype[]): void => {
    for (let k = 0; k < counted.length; k++) {
        const archetype = counted[k];
        archetype.counted = false;
        const record = directory.records[archetype.id];
        if (record !== undefined) record[recordCount] = archetype.count;
    }
    counted.length = 0;
};

/** Lists an archetype whose count changed for the next flush, while a joined thread may read counts. */
export const countChanged = (counted: Archetype[], archetype: Archetype): void => {
    if (archetype.counted) return;
    archetype.counted = true;
    counted.push(archetype);
};

/**
 * At the start of a sync point that applies anything, once a joined thread may read locations: the structure epoch
 * turns odd, by an exchange, so the writes after it can't be seen before it.
 */
export const beginStructure = (directory: LayoutDirectory | null): void => {
    if (directory !== null && directory.guarded) Atomics.add(directory.words, structureWord, 1);
};

/**
 * Once a sync point's directory writes are done: the structure epoch turns even, by a store, since only the world
 * writes it, waking readers only when one waits on it.
 */
export const endStructure = (directory: LayoutDirectory | null): void => {
    if (directory === null) return;
    const { words } = directory;
    const epoch = words[structureWord];
    if ((epoch & 1) === 0) return;
    Atomics.store(words, structureWord, epoch + 1);
    if (Atomics.load(words, structureWaitersWord) !== 0) Atomics.notify(words, structureWord);
};
