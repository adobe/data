import { generationOf, indexOf } from './entities.js';
import {
    archetypeField, capacityField, cursorField, entitiesWord, generationField, recordCount, recordEntities, recordStorages, recordWords,
    remoteFlag, rowField, storageAdded, storageChanged, storageColumn, storageComponent, storageFlags, storageWords, structureWaitersWord,
    structureWord, tableLengthWord, tableOffsetWord, threadShift, tickedFlag,
} from './layout-directory.js';
import {
    appendEntry, archetypeShift, entryWords, kindMask, logCapacityWord, logDeliveredWord, logHeaderBytes, logLimitWord, logOffsetWord,
    logPublishedWord, logSyncWord, logVersionWord, moveEntry, nullTag, ownTag, rangeEntry, setEntry, slotTags, startTag, swapEntry, syncEntry,
} from './move-log.js';

// A joined thread's object columns: by row, as the world's are, following the world's rows through the move log
// (`move-log.ts`), replayed lazily, or rebuilt from the layout directory when the log lapped it. Their ticks are the
// world's storages', in shared memory, which the world stamps at sync points and this thread's systems as they write.

/** One of this thread's object components in one archetype: its values by row. */
export type Column = {
    readonly component: number;
    readonly start: unknown;
    values: unknown[];
};

/** An archetype holding this thread's objects, by the world's number: its columns, and each row's entity. */
export type Mirrored = {
    readonly columns: readonly Column[];
    /** Columns by component number. */
    readonly byComponent: readonly (Column | undefined)[];
    entities: Float64Array;
    count: number;
};

/** A value this thread gave one of its objects, staged until a sync point applies it or drops its command. */
type Staged = { readonly slot: number; readonly entity: number; readonly component: number; readonly value: unknown; readonly sync: number; live: boolean };

/** Whether replaying is done, waits for a component's key to be named, or found the log lapped or replaced. */
export type Replayed = "current" | "held" | "lapped";

/** A joined thread's mirror of the world's rows holding its objects. */
export type Mirror = {
    readonly memory: WebAssembly.Memory;
    /** This thread's number, as storage flags name it. */
    readonly thread: number;
    /** The log header's offset. */
    readonly block: number;
    buffer: ArrayBufferLike;
    /** The whole buffer as words, for the layout directory, and signed, for `Atomics.wait`. */
    words: Uint32Array;
    signed: Int32Array;
    header: Int32Array;
    ring: Uint32Array;
    ringEntities: Float64Array;
    /** The ring's version, -1 before the first rebuild, and its mask. */
    version: number;
    mask: number;
    /** The next entry to replay, and the sync replayed through, both modulo 2^32. */
    position: number;
    through: number;
    /** The tick of the sync being replayed. */
    tick: number;
    /** Keys of this thread's components by the world's numbers: null for one this thread has no key of. */
    readonly keys: Map<number, symbol | null>;
    readonly starts: Map<number, unknown>;
    archetypes: (Mirrored | null | undefined)[];
    /** Entries copied out of the ring before they're applied. */
    scratch: Uint32Array;
    scratchEntities: Float64Array;
    staged: Staged[];
    /** The first staged slot not yet settled, by index into `staged`; the next slot's id. */
    head: number;
    nextSlot: number;
    /** Times it rebuilt, for tests. */
    rebuilds: number;
    /**
     * Runs this thread's finalizers for the stops of every sync through `sync`, before that sync's entries apply, so
     * they read its objects at the rows the stops name; after the log lapped, with `old`, which gives an entity's
     * objects as they were before the rebuild. False while a finalizer the stops name isn't set up here yet, so
     * replay holds before that sync.
     */
    finalize: ((sync: number, old: Previously | null) => boolean) | null;
};

/** An entity's object before a rebuild, or `start` where it held none there. */
export type Previously = (entity: number, component: number, start: unknown) => unknown;

/** A mirror of the rows holding thread `thread`'s objects, read from the log at `block`; it rebuilds first. */
export const createMirror = (memory: WebAssembly.Memory, block: number, thread: number): Mirror => {
    const mirror: Mirror = {
        memory, thread, block, buffer: memory.buffer, words: new Uint32Array(0), signed: new Int32Array(0), header: new Int32Array(0),
        ring: new Uint32Array(0), ringEntities: new Float64Array(0), version: -1, mask: 0, position: 0, through: 0, tick: 0,
        keys: new Map(), starts: new Map(), archetypes: [], scratch: new Uint32Array(1024), scratchEntities: new Float64Array(0),
        staged: [], head: 0, nextSlot: 0, rebuilds: 0, finalize: null,
    };
    refresh(mirror);
    return mirror;
};

/** Views of the memory again, once it grew; the ring's, once it moved. */
const refresh = (mirror: Mirror): void => {
    const buffer = mirror.memory.buffer;
    if (buffer.byteLength !== mirror.words.byteLength || buffer !== mirror.buffer) {
        mirror.buffer = buffer;
        mirror.words = new Uint32Array(buffer);
        mirror.signed = new Int32Array(buffer);
        mirror.header = new Int32Array(buffer, mirror.block, logHeaderBytes / 4);
        mirror.ring = new Uint32Array(0);
    }
};

const viewRing = (mirror: Mirror): void => {
    const { header, buffer } = mirror;
    const offset = header[logOffsetWord];
    const capacity = header[logCapacityWord];
    mirror.ring = new Uint32Array(buffer, offset, capacity * entryWords);
    mirror.ringEntities = new Float64Array(buffer, offset, capacity * 2);
    mirror.mask = capacity - 1;
};

/** What a component starts at on this thread: its declaration's default, or `null`. */
const startOf = (key: symbol | null, defaultOf: (key: symbol) => unknown): unknown => key === null ? null : defaultOf(key);

/** Names the key of a component this thread fills, by the world's number: null for one it has no key of. */
export const nameComponent = (mirror: Mirror, component: number, key: symbol | null, defaultOf: (key: symbol) => unknown): void => {
    mirror.keys.set(component, key);
    mirror.starts.set(component, startOf(key, defaultOf));
};

/** An archetype's record in the directory, by its first word, or -1 before it's entered. */
const recordOf = (mirror: Mirror, id: number): number => {
    const { words } = mirror;
    if (id >= Atomics.load(words, tableLengthWord)) return -1;
    const offset = words[(words[tableOffsetWord] >> 2) + id];
    return offset === 0 ? -1 : offset >> 2;
};

/**
 * Columns for an archetype from its record: this thread's components in it, with their keys. Null for one holding none
 * of its objects; undefined while a component it holds has no key named yet.
 */
const columnsOf = (mirror: Mirror, record: number): Column[] | null | undefined => {
    const { words } = mirror;
    const columns: Column[] = [];
    let holds = false;
    for (let s = 0; s < words[record + recordStorages]; s++) {
        const base = record + recordWords + s * storageWords;
        const flags = words[base + storageFlags];
        if ((flags & remoteFlag) === 0 || flags >>> threadShift !== mirror.thread) continue;
        holds = true;
        const component = words[base + storageComponent];
        const key = mirror.keys.get(component);
        if (key === undefined) return undefined;
        if (key !== null) columns.push({ component, start: mirror.starts.get(component), values: [] });
    }
    return holds ? columns : null;
};

const mirroredOf = (columns: readonly Column[], capacity: number): Mirrored => {
    const byComponent: (Column | undefined)[] = [];
    for (const column of columns) byComponent[column.component] = column;
    return { columns, byComponent, entities: new Float64Array(Math.max(16, capacity)), count: 0 };
};

/** The mirror of archetype `id`, made from its record the first time an entry names it; undefined while held. */
const archetypeOf = (mirror: Mirror, id: number): Mirrored | null | undefined => {
    const known = mirror.archetypes[id];
    if (known !== undefined) return known;
    const record = recordOf(mirror, id);
    if (record < 0) return undefined;
    const columns = columnsOf(mirror, record);
    if (columns === undefined) return undefined;
    return mirror.archetypes[id] = columns === null ? null : mirroredOf(columns, 16);
};

/** Room for row `row`. */
const ensureRow = (archetype: Mirrored, row: number): void => {
    if (row < archetype.entities.length) return;
    let length = archetype.entities.length * 2;
    while (length <= row) length *= 2;
    const entities = new Float64Array(length);
    entities.set(archetype.entities);
    archetype.entities = entities;
};

/** Row `row` filled with `entity`, every column at its start. */
const fill = (archetype: Mirrored, row: number, entity: number): void => {
    ensureRow(archetype, row);
    archetype.entities[row] = entity;
    const { columns } = archetype;
    for (let c = 0; c < columns.length; c++) {
        const column = columns[c];
        column.values[row] = column.start;
    }
    if (row >= archetype.count) archetype.count = row + 1;
};

/** The value of a staged slot, taking it; the start where it was settled already. */
const take = (mirror: Mirror, slot: number, start: unknown): unknown => {
    const at = mirror.head + ((slot - (mirror.staged[mirror.head]?.slot ?? slot)) | 0);
    const staged = mirror.staged[at];
    if (staged === undefined || staged.slot !== slot || !staged.live) return start;
    staged.live = false;
    return staged.value;
};

/** Settles staged slots whose sync applied without naming them: their commands dropped, so their values are released. */
const settle = (mirror: Mirror): void => {
    const { staged } = mirror;
    for (let k = mirror.head; k < staged.length; k++) {
        const entry = staged[k];
        if (entry.live && ((mirror.through - entry.sync) | 0) >= 0) entry.live = false;
    }
    while (mirror.head < staged.length && !staged[mirror.head].live) mirror.head++;
    if (mirror.head === staged.length) {
        staged.length = 0;
        mirror.head = 0;
    }
    else if (mirror.head > 1024 && mirror.head * 2 > staged.length) {
        staged.splice(0, mirror.head);
        mirror.head = 0;
    }
};

/**
 * Stages a value this thread gives one of its objects, for the command that names its slot, applied at sync `sync`;
 * returns the slot's id.
 */
export const stage = (mirror: Mirror, entity: number, component: number, value: unknown, sync: number): number => {
    const slot = mirror.nextSlot;
    mirror.nextSlot = (slot + 1) >>> 0;
    mirror.staged.push({ slot, entity, component, value, sync: sync >>> 0, live: true });
    return slot;
};

/**
 * Applies `count` entries copied into the scratch, in order; returns how many, fewer when a sync's stops can't be
 * finalized yet, so it stops before that sync.
 */
const apply = (mirror: Mirror, count: number): number => {
    const { scratch, scratchEntities, archetypes } = mirror;
    for (let e = 0; e < count; e++) {
        const at = e * entryWords;
        const first = scratch[at];
        const archetype = first >>> archetypeShift;
        switch (first & kindMask) {
            case syncEntry: {
                // Its stops are finalized against the rows before it applies.
                if (mirror.finalize !== null && !mirror.finalize(scratch[at + 1], null)) return e;
                mirror.tick = scratch[at + 1] + scratch[at + 2] * 0x100000000;
                break;
            }
            case moveEntry: {
                const from = archetypes[archetype];
                const to = archetypes[scratch[at + 2]];
                if (from === null || to === null || from === undefined || to === undefined) break;
                const fromRow = scratch[at + 1];
                const toRow = scratch[at + 3];
                ensureRow(to, toRow);
                to.entities[toRow] = from.entities[fromRow];
                const { columns } = to;
                for (let c = 0; c < columns.length; c++) {
                    const column = columns[c];
                    const source = from.byComponent[column.component];
                    column.values[toRow] = source === undefined ? column.start : source.values[fromRow];
                }
                if (toRow >= to.count) to.count = toRow + 1;
                break;
            }
            case appendEntry: {
                const to = archetypes[archetype];
                if (to !== null && to !== undefined) fill(to, scratch[at + 1], scratch[at + 2] + scratch[at + 3] * 0x100000000);
                break;
            }
            case rangeEntry: {
                const to = archetypes[archetype];
                const row = scratch[at + 1];
                const rows = scratch[at + 2];
                if (to !== null && to !== undefined) for (let k = 0; k < rows; k++) fill(to, row + k, scratchEntities[(e + 1) * 2 + k]);
                e += Math.ceil(rows / 2);
                break;
            }
            case swapEntry: {
                const from = archetypes[archetype];
                if (from === null || from === undefined) break;
                const last = scratch[at + 1];
                const row = scratch[at + 2];
                const { columns } = from;
                if (last !== row) {
                    from.entities[row] = from.entities[last];
                    for (let c = 0; c < columns.length; c++) {
                        const column = columns[c];
                        column.values[row] = column.values[last];
                    }
                }
                for (let c = 0; c < columns.length; c++) columns[c].values[last] = undefined;
                from.count = last;
                break;
            }
            case setEntry: {
                const to = archetypes[archetype];
                const column = to === null || to === undefined ? undefined : to.byComponent[scratch[at + 2]];
                const tag = scratch[at + 3];
                const value = tag === startTag ? column?.start : tag === nullTag ? null : take(mirror, (tag - slotTags) >>> 0, column?.start);
                if (column !== undefined) column.values[scratch[at + 1]] = value;
                break;
            }
        }
    }
    return count;
};

/** Copies entries `from` to `from + count` out of the ring, wrapping, into the scratch. */
const copy = (mirror: Mirror, from: number, count: number): void => {
    if (mirror.scratch.length < count * entryWords) mirror.scratch = new Uint32Array(Math.max(count * entryWords, mirror.scratch.length * 2));
    const { ring, mask, scratch } = mirror;
    const start = from & mask;
    const first = Math.min(count, mask + 1 - start);
    scratch.set(ring.subarray(start * entryWords, (start + first) * entryWords));
    if (first < count) scratch.set(ring.subarray(0, (count - first) * entryWords), first * entryWords);
    if (mirror.scratchEntities.buffer !== scratch.buffer) mirror.scratchEntities = new Float64Array(scratch.buffer, 0, scratch.length / 2);
};

/**
 * Where the first entry of the first sync naming an archetype this thread can't mirror yet is, among `count` copied,
 * so replay stops before that sync; `count` when every one can be.
 */
const heldAt = (mirror: Mirror, count: number): number => {
    const { scratch } = mirror;
    let syncStart = 0;
    for (let e = 0; e < count; e++) {
        const first = scratch[e * entryWords];
        const kind = first & kindMask;
        if (kind === syncEntry) {
            syncStart = e;
            continue;
        }
        if (kind === rangeEntry) {
            if (archetypeOf(mirror, first >>> archetypeShift) === undefined) return syncStart;
            e += Math.ceil(scratch[e * entryWords + 2] / 2);
            continue;
        }
        if (archetypeOf(mirror, first >>> archetypeShift) === undefined) return syncStart;
        if (kind === moveEntry && archetypeOf(mirror, scratch[e * entryWords + 2]) === undefined) return syncStart;
    }
    return count;
};

/**
 * Replays every published sync since the last, in order: each one's entries, then its staged slots it didn't name are
 * settled. Entries are copied out first, and used only if the writer didn't lap them. Lapped, or with the ring
 * replaced, it applies nothing: the thread rebuilds.
 */
export const replay = (mirror: Mirror): Replayed => {
    refresh(mirror);
    const { header } = mirror;
    if (Atomics.load(header, logVersionWord) !== mirror.version) return "lapped";
    if (mirror.ring.length === 0) viewRing(mirror);
    const sync = Atomics.load(header, logSyncWord) >>> 0;
    const published = Atomics.load(header, logPublishedWord) >>> 0;
    const count = (published - mirror.position) >>> 0;
    if (count > mirror.mask + 1) return "lapped";
    if (count > 0) {
        copy(mirror, mirror.position, count);
        // An exchange, so the copy's loads complete before it: the limit then covers whatever the writer overwrote.
        const limit = Atomics.add(header, logLimitWord, 0) >>> 0;
        if (((limit - mirror.position) >>> 0) > mirror.mask + 1 || Atomics.load(header, logVersionWord) !== mirror.version) return "lapped";
        const applied = apply(mirror, heldAt(mirror, count));
        mirror.position = (mirror.position + applied) >>> 0;
        if (applied < count) {
            // Through the last sync applied, the one before the held one.
            if (applied > 0) mirror.through = mirror.tick >>> 0;
            settle(mirror);
            return "held";
        }
    }
    // Syncs without entries here may have stops too.
    if (mirror.finalize !== null && !mirror.finalize(sync, null)) {
        if (count > 0) mirror.through = mirror.tick >>> 0;
        settle(mirror);
        return "held";
    }
    mirror.through = sync;
    settle(mirror);
    return "current";
};

/** Whether the structure epoch is odd, a sync point applying: readers wait for it to turn even. */
export const applying = (mirror: Mirror): boolean => (Atomics.load(mirror.signed, structureWord) & 1) === 1;

/** Waits without blocking until the structure epoch moves on, counted among its waiters so the world notifies it. */
export const waitStructure = async (mirror: Mirror): Promise<void> => {
    const { signed } = mirror;
    const epoch = Atomics.load(signed, structureWord);
    if ((epoch & 1) === 0) return;
    Atomics.add(signed, structureWaitersWord, 1);
    try {
        if (typeof Atomics.waitAsync !== "function") {
            await new Promise(resolve => setTimeout(resolve, 0));
            return;
        }
        const waited = Atomics.waitAsync(signed, structureWord, epoch);
        if (waited.async) await waited.value;
    }
    finally {
        Atomics.sub(signed, structureWaitersWord, 1);
    }
};

/** Waits without blocking until observers were delivered through another sync than `through`. */
export const waitDelivered = async (mirror: Mirror): Promise<void> => {
    const { header } = mirror;
    const delivered = Atomics.load(header, logDeliveredWord);
    if ((delivered >>> 0) === mirror.through) return;
    if (typeof Atomics.waitAsync !== "function") {
        await new Promise(resolve => setTimeout(resolve, 0));
        return;
    }
    const waited = Atomics.waitAsync(header, logDeliveredWord, delivered);
    if (waited.async) await waited.value;
};

/** Scratch for rebuilds, by entity index: where each entity was among the old rows. */
type Previous = { entity: Float64Array; archetype: Int32Array; row: Int32Array };
const previous: Previous = { entity: new Float64Array(0), archetype: new Int32Array(0), row: new Int32Array(0) };

/** Indexes the old rows by entity index, for values kept across a rebuild. */
const indexPrevious = (archetypes: readonly (Mirrored | null | undefined)[], length: number): void => {
    if (previous.entity.length < length) {
        previous.entity = new Float64Array(length);
        previous.archetype = new Int32Array(length);
        previous.row = new Int32Array(length);
    }
    previous.archetype.fill(-1, 0, length);
    for (let id = 0; id < archetypes.length; id++) {
        const archetype = archetypes[id];
        if (archetype === null || archetype === undefined) continue;
        for (let row = 0; row < archetype.count; row++) {
            const entity = archetype.entities[row];
            const index = indexOf(entity);
            if (index >= length) continue;
            previous.entity[index] = entity;
            previous.archetype[index] = id;
            previous.row[index] = row;
        }
    }
};

/** The value an entity held in a column before the rebuild; `start` where it held none. */
const previousValue = (old: readonly (Mirrored | null | undefined)[], entity: number, component: number, start: unknown): unknown => {
    const index = indexOf(entity);
    if (index >= previous.archetype.length || previous.archetype[index] < 0 || previous.entity[index] !== entity) return start;
    const column = old[previous.archetype[index]]?.byComponent[component];
    return column === undefined ? start : column.values[previous.row[index]];
};

/**
 * Rebuilds every column from the layout directory, as of the last published sync, under the structure epoch: rows
 * from each archetype's `entities` and count, values by the tag each row's storage holds, a staged slot's taken, any
 * other the thread's own kept by entity, and ticks from the world's. Returns false while a sync point applies, or a
 * component it holds has no key named yet, having changed nothing.
 */
export const rebuild = (mirror: Mirror): boolean => {
    refresh(mirror);
    const { words, signed, header, buffer } = mirror;
    const epoch = Atomics.load(signed, structureWord);
    if ((epoch & 1) === 1) return false;
    const version = Atomics.load(header, logVersionWord);
    const sync = Atomics.load(header, logSyncWord) >>> 0;
    const published = Atomics.load(header, logPublishedWord) >>> 0;
    const old = mirror.archetypes;
    const entityLength = new Int32Array(buffer, words[entitiesWord + cursorField], 4)[2];
    /** The old rows, indexed by entity only once a row's value is one this thread gave and kept. */
    let indexed = false;
    // Stops through the sync it rebuilds to are finalized first, with the objects as they were.
    if (mirror.finalize !== null && !mirror.finalize(sync, (entity, component, start) => {
        if (!indexed) {
            indexPrevious(old, entityLength);
            indexed = true;
        }
        return previousValue(old, entity, component, start);
    })) return false;
    const archetypes: (Mirrored | null)[] = [];
    /** Staged slots the rebuild takes, settled only once it's complete. */
    const taken: number[] = [];
    const tables = Atomics.load(words, tableLengthWord);
    for (let id = 0; id < tables; id++) {
        const record = recordOf(mirror, id);
        if (record < 0) {
            archetypes.push(null);
            continue;
        }
        const columns = columnsOf(mirror, record);
        if (columns === undefined) return false;
        if (columns === null) {
            archetypes.push(null);
            continue;
        }
        const count = words[record + recordCount];
        const archetype = mirroredOf(columns, count);
        archetype.entities.set(new Float64Array(buffer, words[record + recordEntities], count));
        archetype.count = count;
        for (const column of columns) {
            const storage = storageOf(words, record, column.component);
            const tags = new Uint32Array(buffer, words[storage + storageColumn], count);
            column.values = new Array(count).fill(column.start);
            for (let row = 0; row < count; row++) {
                const tag = tags[row];
                if (tag === startTag) continue;
                const entity = archetype.entities[row];
                if (tag === nullTag) column.values[row] = null;
                else {
                    // A value this thread's systems wrote is kept by entity, as one whose slot settled.
                    const slot = (tag - slotTags) >>> 0;
                    const staged = tag === ownTag ? undefined : stagedOf(mirror, slot);
                    if (staged === undefined) {
                        if (!indexed) {
                            indexPrevious(old, entityLength);
                            indexed = true;
                        }
                        column.values[row] = previousValue(old, entity, column.component, column.start);
                    }
                    else {
                        column.values[row] = staged.value;
                        taken.push(slot);
                    }
                }
            }
        }
        archetypes.push(archetype);
    }
    // An exchange, so every read above completes before it.
    if (Atomics.add(signed, structureWord, 0) !== epoch) return false;
    for (const slot of taken) {
        const staged = stagedOf(mirror, slot);
        if (staged !== undefined) staged.live = false;
    }
    mirror.archetypes = archetypes;
    mirror.version = version;
    mirror.position = published;
    mirror.through = sync;
    mirror.ring = new Uint32Array(0);
    viewRing(mirror);
    settle(mirror);
    mirror.rebuilds++;
    return true;
};

/** A storage's first word in a record, by its component. */
const storageOf = (words: Uint32Array, record: number, component: number): number => {
    for (let s = 0; s < words[record + recordStorages]; s++) {
        const base = record + recordWords + s * storageWords;
        if (words[base + storageComponent] === component) return base;
    }
    return -1;
};

/** A staged slot's value while no sync applied it, else `settled`. */
export const stagedValue = (mirror: Mirror, slot: number, settled: unknown): unknown => {
    const staged = stagedOf(mirror, slot);
    return staged === undefined ? settled : staged.value;
};

/** A live staged slot by its id. */
const stagedOf = (mirror: Mirror, slot: number): Staged | undefined => {
    const { staged, head } = mirror;
    if (head >= staged.length) return undefined;
    const at = head + ((slot - staged[head].slot) | 0);
    const entry = staged[at];
    return entry !== undefined && entry.slot === slot && entry.live ? entry : undefined;
};

/** Where an entity is, or null when it isn't alive: read while no sync point applies. */
export type Location = { readonly archetype: number; readonly row: number };

/**
 * Brings the mirror up to the last published sync and finds an entity's archetype and row, under the structure
 * epoch: read while it's even, checked again after. Returns "applying" while a sync point applies, "held" while a
 * component has no key yet, and "behind" while observers weren't delivered through that sync yet, since their values
 * are older than the objects there.
 */
export const locate = (mirror: Mirror, entity: number): Location | null | "applying" | "held" | "behind" => {
    for (; ;) {
        refresh(mirror);
        const { signed, words, buffer, header } = mirror;
        const epoch = Atomics.load(signed, structureWord);
        if ((epoch & 1) === 1) return "applying";
        const replayed = replay(mirror);
        if (replayed === "held") return "held";
        if (replayed === "lapped" && !rebuild(mirror)) {
            if (applying(mirror)) return "applying";
            return "held";
        }
        if ((Atomics.load(header, logDeliveredWord) >>> 0) !== mirror.through) return "behind";
        const index = indexOf(entity);
        const capacity = words[entitiesWord + capacityField];
        let location: Location | null = null;
        if (index < capacity) {
            const archetype = Atomics.load(new Int32Array(buffer, words[entitiesWord + archetypeField], capacity), index);
            const row = Atomics.load(new Uint32Array(buffer, words[entitiesWord + rowField], capacity), index);
            const generation = Atomics.load(new Uint32Array(buffer, words[entitiesWord + generationField], capacity), index);
            if (archetype >= 0 && generation === generationOf(entity)) location = { archetype, row };
        }
        if (Atomics.add(signed, structureWord, 0) === epoch) return location;
    }
};

/** This thread's object of `component` at a location, and whether its archetype holds one. */
export const objectAt = (mirror: Mirror, location: Location, component: number): { readonly held: boolean; readonly value: unknown } => {
    const column = mirror.archetypes[location.archetype]?.byComponent[component];
    return column === undefined ? { held: false, value: undefined } : { held: true, value: column.values[location.row] };
};

/** The components of this thread's objects an archetype holds, by the world's numbers. */
export const componentsAt = (mirror: Mirror, archetype: number): readonly number[] => mirror.archetypes[archetype]?.columns.map(column => column.component) ?? [];

/** For tests: an entity's value in one of this thread's columns by its row, as of the last replay, and its ticks, the world's. */
export const cellOf = (mirror: Mirror, archetype: number, row: number, component: number): { readonly value: unknown; readonly added: number; readonly changed: number } | null => {
    const column = mirror.archetypes[archetype]?.byComponent[component];
    if (column === undefined || row >= (mirror.archetypes[archetype]?.count ?? 0)) return null;
    refresh(mirror);
    const { words, buffer } = mirror;
    const storage = storageOf(words, recordOf(mirror, archetype), component);
    const ticked = (words[storage + storageFlags] & tickedFlag) !== 0;
    const tickAt = (field: number): number => ticked ? new Float64Array(buffer, words[storage + field], row + 1)[row] : 0;
    return { value: column.values[row], added: tickAt(storageAdded), changed: tickAt(storageChanged) };
};
