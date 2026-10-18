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
 * after, retrying on a change, and waits on it while it's odd; the world notifies it when it turns even.
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

/**
 * An archetype record: its capacity, `entities` offset, storage count, version and flags, then per storage its component
 * number, flags, column, `added`, `changed`, `chunkAdded` and `chunkChanged` offsets, and chunk count. Offsets a storage
 * doesn't have are 0. A record is allocated once, since an archetype's storages are fixed, and never moves.
 */
export const recordCapacity = 0;
export const recordEntities = 1;
export const recordStorages = 2;
export const recordVersion = 3;
export const recordFlags = 4;
export const recordWords = 5;
/** Record flags: it's the resource archetype, of the entity resources live on. */
export const resourceFlag = 1;
export const storageWords = 8;
export const storageComponent = 0;
export const storageFlags = 1;
export const storageColumn = 2;
export const storageAdded = 3;
export const storageChanged = 4;
export const storageChunkAdded = 5;
export const storageChunkChanged = 6;
export const storageChunks = 7;
/** Storage flags: it keeps ticks; it has a column in linear memory. */
export const tickedFlag = 1;
export const linearFlag = 2;

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
};

const initialTable = 64;

/** A directory for shared memory; without it, no other thread reads the memory, so there's none. */
export const createLayoutDirectory = (memory: Memory): LayoutDirectory | null => {
    if (!memory.shared) return null;
    const table = allocateArray(memory, Uint32Array, initialTable).fill(0);
    const { header } = memory;
    header[tableOffsetWord] = table.byteOffset;
    header[tableLengthWord] = 0;
    return { memory, header, words: new Int32Array(header.buffer, header.byteOffset, header.length), table, records: [], entities: -1 };
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
    record[recordFlags] = archetype.resource ? resourceFlag : 0;
    for (let s = 0; s < archetype.storages.length; s++) {
        const storage = archetype.storages[s];
        const base = recordWords + s * storageWords;
        const linear = storage.layout.kind === "linear";
        record[base + storageComponent] = storage.component;
        record[base + storageFlags] = (storage.ticked ? tickedFlag : 0) | (linear ? linearFlag : 0);
        record[base + storageColumn] = linear ? storage.views.u8.byteOffset : 0;
        record[base + storageAdded] = storage.ticked ? storage.added.byteOffset : 0;
        record[base + storageChanged] = storage.ticked ? storage.changed.byteOffset : 0;
        record[base + storageChunkAdded] = storage.ticked ? storage.chunkAdded.byteOffset : 0;
        record[base + storageChunkChanged] = storage.ticked ? storage.chunkChanged.byteOffset : 0;
        record[base + storageChunks] = storage.chunkAdded.length;
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
export const flushDirectory = (directory: LayoutDirectory | null, bumped: Archetype[], archetypes: readonly Archetype[], entities: Entities, resourceEntity: number): void => {
    if (directory === null) return;
    const resourceWord = resourceEntity < 0 ? 0 : (resourceEntity >>> 0) + 1;
    if (directory.header[resourceEntityWord] !== resourceWord) Atomics.store(directory.header, resourceEntityWord, resourceWord);
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

/** At the start of a sync point that applies anything: the structure epoch turns odd. */
export const beginStructure = (directory: LayoutDirectory | null): void => {
    if (directory !== null) Atomics.add(directory.words, structureWord, 1);
};

/** Once a sync point's directory writes are done: the structure epoch turns even, waking readers waiting on it. */
export const endStructure = (directory: LayoutDirectory | null): void => {
    if (directory === null || (directory.words[structureWord] & 1) === 0) return;
    Atomics.add(directory.words, structureWord, 1);
    Atomics.notify(directory.words, structureWord);
};
