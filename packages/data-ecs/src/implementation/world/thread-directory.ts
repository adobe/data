import { declarationOf, firstKeyOf, keyOfId, labelOf } from '../../interface/registry/index.js';
import { layoutOf, viewsOf, type Layout, type Views } from '../../interface/registry/layout.js';
import { writeOf } from './archetype.js';
import { emptyViews } from './arrays.js';
import { tableLength } from './entities.js';
import {
    archetypeField, capacityField, cursorField, entitiesVersionField, entitiesWord, freeCapacityField, freeField, generationField, linearFlag,
    recordCapacity, recordCount, recordEntities, recordFlags, recordStorages, recordVersion, recordWords, remoteFlag, resourceEntityWord, resourceFlag,
    rowField, storageAdded, storageChanged, storageChunkAdded, storageChunkChanged, storageChunks, storageColumn, storageComponent, storageFlags,
    storageWords, tableLengthWord, tableOffsetWord, threadShift, tickedFlag,
} from './layout-directory.js';
import { coveringBuffer, pageBytes, pagesWord } from './memory.js';
import type { Mirror, Mirrored } from './mirror.js';
import type { Row, RowArchetype, RowHost, RowStorage } from './rows.js';
import type { Key } from './state.js';

// A joined thread's view of the world's layout directory (threads.md, "Shared layout directory"): archetypes by their
// records, struct columns and ticks in shared memory, this thread's objects in its mirror, and the entity table, with
// the world's numbers for the keys its systems name.

/** A joined thread's view of a storage of the world's, in shared memory, or of this thread's objects, in its mirror. */
export type ThreadStorage = RowStorage & { readonly component: number };

/** A joined thread's view of one of the world's archetypes, by its record, as of its version and the mirror's columns. */
export type ThreadArchetype = RowArchetype & {
    readonly record: number;
    readonly version: number;
    readonly mirrored: Mirrored | null | undefined;
    readonly components: readonly number[];
    readonly resource: boolean;
    readonly storageById: readonly (ThreadStorage | undefined)[];
};

export type EntityViews = { cursor: Int32Array; free: Int32Array; generation: Uint32Array; archetype: Int32Array; row: Uint32Array; length: number };

/** A setup naming keys by the world's numbers, with their ids. */
type Named = { readonly keys: readonly (readonly [number, string])[] };

const noTicks = new Float64Array(0);
const noTags = new Uint32Array(0);
const noValues: unknown[] = [];

/** The memory as this thread last viewed it: its buffer, its words and its views, made again once it grew. */
export type Viewed = { buffer: ArrayBufferLike; words: Uint32Array; views: Views };

/**
 * A joined thread's directory reader over `memory`, its objects in `mirror` where it fills some: one per thread,
 * shared by the systems the world places there and the synced systems it adds.
 */
export const createThreadDirectory = (memory: WebAssembly.Memory, mirror: Mirror | null) => {
    const viewed: Viewed = { buffer: new ArrayBuffer(0), words: new Uint32Array(0), views: emptyViews };
    let pages = -1;
    /** By the world's number: what its key is here, and its layout, for the keys this thread's systems name. */
    const keys: (Key | undefined)[] = [];
    const layouts: Layout[] = [];
    const numbers = new Map<Key, number>();
    const archetypes: (ThreadArchetype | undefined)[] = [];
    let entities: EntityViews | null = null;
    let entitiesVersion = -1;
    const rows: RowHost & { tick: number } = { layouts, rows: new Map<string, Row>(), tick: 0 };
    const noMirrored: readonly (Mirrored | null | undefined)[] = [];
    const thread = mirror?.thread ?? -1;

    /** Views of the memory again, once it grew; every archetype's views with them. Returns its buffer. */
    const refresh = (): ArrayBufferLike => {
        if (viewed.words.length === 0) viewed.words = new Uint32Array(memory.buffer);
        const current = Atomics.load(viewed.words, pagesWord);
        if (current === pages) return viewed.buffer;
        const latest = coveringBuffer(memory, current * pageBytes);
        if (latest.byteLength < current * pageBytes) throw new Error(`This thread's memory is ${latest.byteLength} bytes, short of the ${current * pageBytes} the world stored.`);
        viewed.buffer = latest;
        viewed.words = new Uint32Array(latest);
        viewed.views = viewsOf(latest, 0, latest.byteLength);
        pages = current;
        archetypes.length = 0;
        entitiesVersion = -1;
        return latest;
    };

    const refreshEntities = (): EntityViews => {
        const { words, buffer } = viewed;
        const record = entitiesWord;
        const version = Atomics.load(words, record + entitiesVersionField);
        if (entities === null || version !== entitiesVersion) {
            const capacity = words[record + capacityField];
            const views: EntityViews = {
                cursor: new Int32Array(buffer, words[record + cursorField], 4),
                free: new Int32Array(buffer, words[record + freeField], words[record + freeCapacityField]),
                archetype: new Int32Array(buffer, words[record + archetypeField], capacity),
                row: new Uint32Array(buffer, words[record + rowField], capacity),
                generation: new Uint32Array(buffer, words[record + generationField], capacity),
                length: 0,
            };
            if (entities === null) entities = views;
            // Spawners hold the table, so it's updated in place.
            else Object.assign(entities, views);
            entitiesVersion = version;
        }
        entities.length = entities.cursor[tableLength];
        return entities;
    };

    /** A storage's view, by its record's words; this thread's objects by their mirror column. */
    const storageOf = (base: number, capacity: number, mirrored: Mirrored | null | undefined): ThreadStorage | undefined => {
        const { words, buffer } = viewed;
        const component = words[base + storageComponent];
        const layout = layouts[component];
        if (layout === undefined) return undefined;
        const flags = words[base + storageFlags];
        const ticked = (flags & tickedFlag) !== 0;
        const own = (flags & remoteFlag) !== 0 && flags >>> threadShift === thread;
        const chunks = words[base + storageChunks];
        const added = ticked ? new Float64Array(buffer, words[base + storageAdded], capacity) : noTicks;
        const changed = ticked ? new Float64Array(buffer, words[base + storageChanged], capacity) : noTicks;
        return {
            component,
            layout,
            ...writeOf(layout),
            views: layout.kind === "linear" && (flags & linearFlag) !== 0 ? viewsOf(buffer, words[base + storageColumn], capacity * layout.stride) : emptyViews,
            // Rows only this thread's systems write: a mirror's column, or one of its own while the mirror has none.
            values: own ? mirrored?.byComponent[component]?.values ?? [] : noValues,
            tags: own ? new Uint32Array(buffer, words[base + storageColumn], capacity) : noTags,
            ticked,
            added,
            // A constant's `changed` ticks are its `added` ticks.
            changed: layout.kind === "constant" ? added : changed,
            chunkAdded: ticked ? new Float64Array(buffer, words[base + storageChunkAdded], chunks) : noTicks,
            chunkChanged: ticked ? new Float64Array(buffer, words[layout.kind === "constant" ? base + storageChunkAdded : base + storageChunkChanged], chunks) : noTicks,
        };
    };

    const viewArchetype = (id: number, record: number, version: number, mirrored: Mirrored | null | undefined): ThreadArchetype => {
        const { words, buffer } = viewed;
        const capacity = words[record + recordCapacity];
        const storageById: (ThreadStorage | undefined)[] = [];
        const components: number[] = [];
        for (let s = 0; s < words[record + recordStorages]; s++) {
            const base = record + recordWords + s * storageWords;
            components.push(words[base + storageComponent]);
            const storage = storageOf(base, capacity, mirrored);
            if (storage !== undefined) storageById[storage.component] = storage;
        }
        return {
            id, record, version, mirrored, components, storageById,
            resource: (words[record + recordFlags] & resourceFlag) !== 0,
            entities: new Float64Array(buffer, words[record + recordEntities], capacity),
        };
    };

    /** An archetype's view: one load of its record's version, and new views only once it, or the mirror, moved on. */
    const archetypeAt = (id: number): ThreadArchetype | undefined => {
        const { words } = viewed;
        const cached = archetypes[id];
        const mirrored = (mirror?.archetypes ?? noMirrored)[id];
        if (cached !== undefined && cached.mirrored === mirrored && Atomics.load(words, cached.record + recordVersion) === cached.version) return cached;
        const offset = cached?.record ?? (id < Atomics.load(words, tableLengthWord) ? words[(words[tableOffsetWord] >> 2) + id] >> 2 : 0);
        if (offset === 0) return undefined;
        return archetypes[id] = viewArchetype(id, offset, Atomics.load(words, offset + recordVersion), mirrored);
    };

    const countOf = (archetype: ThreadArchetype): number => viewed.words[archetype.record + recordCount];

    /** The resource entity's archetype and row, or null before resources exist. */
    const resourceRow = (): { readonly archetype: ThreadArchetype; readonly row: number } | null => {
        const word = Atomics.load(viewed.words, resourceEntityWord);
        if (word === 0) return null;
        const table = refreshEntities();
        const index = word - 1;
        const archetype = archetypeAt(table.archetype[index]);
        return archetype === undefined ? null : { archetype, row: table.row[index] };
    };

    const tableCount = (): number => Atomics.load(viewed.words, tableLengthWord);

    /** Takes the world's numbers for the keys of systems or finalizers it places here. */
    const name = (setups: readonly Named[]): void => {
        for (const { keys: named } of setups) {
            for (const [number, id] of named) {
                const key = keyOfId(id);
                if (key === undefined || keys[number] !== undefined) continue;
                keys[number] = key;
                numbers.set(firstKeyOf(key), number);
                layouts[number] = layoutOf(declarationOf(key)?.type);
                // Views hold storages only of components with layouts here, so they're made again.
                archetypes.length = 0;
            }
        }
    };

    const numberOf = (key: Key): number => {
        const number = numbers.get(firstKeyOf(key));
        if (number === undefined) throw new Error(`"${labelOf(key)}" has no number from the world here.`);
        return number;
    };

    return {
        viewed, rows, keys, layouts, numbers, mirror,
        refresh, refreshEntities, archetypeAt, countOf, resourceRow, tableCount, name, numberOf,
        layoutOf: (key: Key): Layout | undefined => layouts[numbers.get(firstKeyOf(key)) ?? -1],
    };
};

export type ThreadDirectory = ReturnType<typeof createThreadDirectory>;
