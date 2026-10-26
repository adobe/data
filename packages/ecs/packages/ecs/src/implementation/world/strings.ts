// © 2026 Adobe. MIT License. See /LICENSE for details.
import { coveringBuffer, type Memory } from './memory.js';

// Strings in shared memory (design.md, "A string's storage"): a string component's column holds a handle per row, to
// an immutable record in the world's memory, which every thread reads, or 0 for `null`, since offset 0 is the
// directory's header. A record is 8-byte aligned, at byte `handle * 8`: its length in UTF-16 code units, its
// generation, then its code units. Only the world's thread writes records: a write makes a new one and lets the old one
// go, freed once no reader may hold it. The world's thread keeps each value as it is too, which it reads, and keeps
// records only while a joined thread may read them: from the first thread's share until the last is gone.

/** A thread's records: reading them, and on the world's thread, writing and freeing them. */
export type StringStore = {
    /** Whether this thread writes records: only the world's does. */
    readonly writes: boolean;
    /** Whether the world keeps records of its strings, while a joined thread may read them. */
    active: boolean;
    /** The text of the record `handle` names, decoded once per record and kept while its generation is the same. */
    readonly read: (handle: number) => string;
    /** A new record holding `text`, by its handle. */
    readonly write: (text: string) => number;
    /** A new record of the same text, 0 for 0, for a copy a reader on another thread holds past its row's sync points. */
    readonly copy: (handle: number) => number;
    /** Lets a record go, 0 for none: it's freed at the end of the second sync point from now, when no reader holds it. */
    readonly retire: (handle: number) => void;
    /** At the end of each sync point: frees the records let go before the last one. */
    readonly settle: () => void;
};

/** What a cached record's text was decoded from: its handle's generation at the time. */
type Cached = { generation: number; text: string };

/** Code units decoded by one call of `String.fromCharCode`, which takes them as arguments. */
const decodeChunk = 4096;

const decode = (units: Uint16Array, start: number, length: number): string => {
    if (length <= 8) {
        let text = "";
        for (let i = 0; i < length; i++) text += String.fromCharCode(units[start + i]);
        return text;
    }
    let text = "";
    for (let at = 0; at < length; at += decodeChunk) {
        const chunk: string = Reflect.apply(String.fromCharCode, null, units.subarray(start + at, start + Math.min(length, at + decodeChunk)));
        text += chunk;
    }
    return text;
};

/** A record's bytes for `length` code units: its two words, then its units, rounded up to 8. */
const recordBytes = (length: number): number => (8 + 2 * length + 7) & ~7;

/** Records at most this many bytes are carved from slabs, by power-of-two size from 16; larger ones are the arena's blocks. */
const slabbed = 512;
const slabBytes = 65536;
/** Slab size classes, 16 to 512 bytes. */
const classes = 6;

/** A slabbed record's size class: its bytes rounded up to a power of two, from 16. */
const classOf = (bytes: number): number => Math.max(0, 28 - Math.clz32(bytes - 1));

/** The views a store reads through, and the cache of what it decoded, by handle. */
type Views = { words: Uint32Array; units: Uint16Array; readonly cache: Map<number, Cached> };

/** Views of the whole buffer, or the same ones while they cover `bytes`; `buffer` gives one covering them. */
const cover = (views: Views, buffer: (bytes: number) => ArrayBufferLike, bytes: number): void => {
    if (views.units.byteLength >= bytes) return;
    const latest = buffer(bytes);
    views.words = new Uint32Array(latest);
    views.units = new Uint16Array(latest);
};

const readOf = (views: Views, buffer: (bytes: number) => ArrayBufferLike) => (handle: number): string => {
    const word = handle << 1;
    cover(views, buffer, handle * 8 + 8);
    const { words } = views;
    const generation = words[word + 1];
    const cached = views.cache.get(handle);
    if (cached !== undefined && cached.generation === generation) return cached.text;
    const length = words[word];
    cover(views, buffer, handle * 8 + 8 + 2 * length);
    const text = decode(views.units, (handle << 2) + 4, length);
    if (cached === undefined) views.cache.set(handle, { generation, text });
    else {
        cached.generation = generation;
        cached.text = text;
    }
    return text;
};

const unwritten = (): never => {
    throw new Error("A string is written on the world's thread only.");
};

/** A joined thread's store over `memory`: it reads records, and writes none. */
export const createStringReader = (memory: WebAssembly.Memory): StringStore => {
    const views: Views = { words: new Uint32Array(0), units: new Uint16Array(0), cache: new Map() };
    return {
        writes: false,
        active: true,
        read: readOf(views, bytes => coveringBuffer(memory, bytes)),
        write: unwritten,
        copy: unwritten,
        retire: unwritten,
        settle: () => {},
    };
};

/** The world's store over its arena, which only the world's thread writes. */
export const createStrings = (memory: Memory): StringStore => {
    const views: Views = { words: new Uint32Array(0), units: new Uint16Array(0), cache: new Map() };
    // The world's thread grows the memory itself, so its buffer covers every record.
    const buffer = (): ArrayBufferLike => memory.memory.buffer;
    const read = readOf(views, buffer);
    /** By slab size class: freed handles, and the rest of the slab being carved. */
    const free: number[][] = Array.from({ length: classes }, () => []);
    const next = new Array<number>(classes).fill(0);
    const end = new Array<number>(classes).fill(0);
    let generation = 0;
    let pending: number[] = [];
    let previous: number[] = [];

    const allocate = (bytes: number): number => {
        if (bytes > slabbed) return memory.allocate(bytes) >> 3;
        const size = classOf(bytes);
        const reused = free[size].pop();
        if (reused !== undefined) return reused;
        if (next[size] === end[size]) {
            const slab = memory.allocate(slabBytes);
            next[size] = slab;
            end[size] = slab + slabBytes;
        }
        // Carved by its class's size, so any record of the class fits the slot once it's freed.
        const offset = next[size];
        next[size] += 16 << size;
        return offset >> 3;
    };

    /** A record of `length` units, its words written and its units left to the caller. */
    const record = (length: number): number => {
        const bytes = recordBytes(length);
        const handle = allocate(bytes);
        cover(views, buffer, handle * 8 + bytes);
        generation = (generation + 1) >>> 0;
        views.words[handle << 1] = length;
        views.words[(handle << 1) + 1] = generation;
        return handle;
    };

    const release = (handle: number): void => {
        const bytes = recordBytes(views.words[handle << 1]);
        if (bytes > slabbed) memory.free(handle << 3, bytes);
        else free[classOf(bytes)].push(handle);
    };

    return {
        writes: true,
        active: false,
        read,
        write: text => {
            const { length } = text;
            const handle = record(length);
            const { units } = views;
            const start = (handle << 2) + 4;
            for (let i = 0; i < length; i++) units[start + i] = text.charCodeAt(i);
            return handle;
        },
        copy: source => {
            if (source === 0) return 0;
            const length = views.words[source << 1];
            const handle = record(length);
            const start = (source << 2) + 4;
            views.units.copyWithin((handle << 2) + 4, start, start + length);
            return handle;
        },
        retire: handle => {
            if (handle !== 0) pending.push(handle);
        },
        settle: () => {
            if (previous.length === 0 && pending.length === 0) return;
            for (let k = 0; k < previous.length; k++) release(previous[k]);
            previous.length = 0;
            const freed = previous;
            previous = pending;
            pending = freed;
        },
    };
};

/** What holds strings: a string's column of handles, its values on the world's thread, and its records. */
type Column = { readonly views: { readonly u32: Uint32Array }; readonly values: unknown[]; readonly strings: StringStore | null };

/** A string column's value at `row`: as the world's thread holds it, or out of its record on another, `null` for 0. */
export const readString = (column: Column, row: number): unknown => {
    const value = column.values[row];
    if (value !== undefined) return value;
    const { strings } = column;
    if (strings === null) throw new Error("A string column has no records to read.");
    const handle = column.views.u32[row];
    return handle === 0 ? null : strings.read(handle);
};

/** Replaces a string column's value at `row`, and while records are kept, its record, letting the old one go. */
export const writeString = (column: Column, row: number, value: unknown): void => {
    const { strings } = column;
    if (strings === null || !strings.writes) throw new Error("A string is written on the world's thread only.");
    column.values[row] = value;
    if (!strings.active) return;
    const handles = column.views.u32;
    const old = handles[row];
    handles[row] = value === null ? 0 : strings.write(typeof value === "string" ? value : String(value));
    strings.retire(old);
};

/** Archetypes as records are kept for them: their string storages, each row's value and handle. */
type Held = { readonly count: number; readonly storages: readonly (Column & { readonly layout: { readonly kind: string } })[] };

/** Starts keeping records, once a thread may read them: one for each value the world holds now. */
export const keepRecords = (strings: StringStore, archetypes: readonly Held[]): void => {
    if (strings.active) return;
    strings.active = true;
    for (const archetype of archetypes) {
        for (const storage of archetype.storages) {
            if (storage.layout.kind !== "string") continue;
            const handles = storage.views.u32;
            for (let row = 0; row < archetype.count; row++) {
                const value = storage.values[row];
                handles[row] = value === null || value === undefined ? 0 : strings.write(typeof value === "string" ? value : String(value));
            }
        }
    }
};

/** Stops keeping records, once no thread reads them: every one is let go. */
export const dropRecords = (strings: StringStore, archetypes: readonly Held[]): void => {
    if (!strings.active) return;
    strings.active = false;
    for (const archetype of archetypes) {
        for (const storage of archetype.storages) {
            if (storage.layout.kind !== "string") continue;
            const handles = storage.views.u32;
            for (let row = 0; row < archetype.count; row++) {
                strings.retire(handles[row]);
                handles[row] = 0;
            }
        }
    }
};
