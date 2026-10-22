// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Finalizer } from '../../interface/finalizer/created.js';
import type { Memory } from './memory.js';
import type { StringStore } from './strings.js';
import { logFinalizedWord, logStopsWord, type MoveLog } from './move-log.js';

// Stop lists (threads.md, "Finalizers on other threads"): what a joined thread's finalizers need of the entities a sync
// point stops, written by the world's thread before it applies, one block per sync point with stops, which the thread
// reads as it replays that sync and acknowledges by the sync it finalized through.
//
// A block's words: its sync, modulo 2^32; the next block's offset, stored once it's written, 0 until then; its groups;
// its bytes. Then a group per finalizer with stops, in the world's finalizer order: its index on the thread, its stops,
// its bytes; then as columns, each on 8 bytes, every stop's entity (f64), its archetype and row before apply (u32), the
// tag of each object it reads (u32), and the value of each linear struct it reads in that component's layout, or for a
// string, the handle of a copy of its record, freed with the block, since the thread may read it sync points later.

export const blockSyncWord = 0;
export const blockNextWord = 1;
export const blockGroupsWord = 2;
export const blockBytesWord = 3;
export const blockHeaderBytes = 16;
export const groupIndexWord = 0;
export const groupCountWord = 1;
export const groupBytesWord = 2;
export const groupHeaderBytes = 16;

const align = (bytes: number): number => (bytes + 7) & ~7;

/** Where a group of `count` stops keeps its entities, archetypes and rows, past its header. */
export const entitiesAt = (group: number): number => group + groupHeaderBytes;
export const archetypesAt = (group: number, count: number): number => group + groupHeaderBytes + 8 * count;
export const rowsAt = (group: number, count: number): number => group + groupHeaderBytes + 12 * count;
/** Where a group's tags of its `object`th object read start. */
export const tagsAt = (group: number, count: number, object: number): number => group + groupHeaderBytes + 16 * count + object * align(4 * count);
/** Where a group's linear values start, after the tags of its `objects` object reads. */
export const valuesAt = (group: number, count: number, objects: number): number => tagsAt(group, count, objects);
/** Bytes of one linear read's column of `count` values of `stride` bytes. */
export const columnBytes = (count: number, stride: number): number => align(count * stride);

/** Bytes of a group of `count` stops of a finalizer reading `objects` objects and linear values of `strides` bytes. */
const groupBytes = (count: number, objects: number, strides: readonly number[]): number => {
    let bytes = valuesAt(0, count, objects);
    for (const stride of strides) bytes += columnBytes(count, stride);
    return bytes;
};

/** One of a joined thread's finalizers, as the world writes its stops. */
export type StopsOf = {
    readonly finalizer: Finalizer;
    /** Its index on the thread. */
    readonly index: number;
    /** The components of its object reads, then of its linear reads with their strides, in its `read` order. */
    readonly objects: readonly number[];
    readonly linear: readonly number[];
    readonly strides: readonly number[];
    /** By linear read: whether it's a string's handles, whose records the block holds copies of. */
    readonly copies: readonly boolean[];
    /** This sync point's stops, as plan entries, reused by every sync point. */
    readonly entries: number[];
};

/** A block the thread hasn't acknowledged, or the newest it has, which it still reads the next block's offset from. */
type Written = {
    readonly offset: number;
    readonly bytes: number;
    readonly sync: number;
    /** Indexes of despawned entities, held until the thread acknowledges. */
    readonly held: number[];
    /** Its finalizers and their stops, reported if the thread is gone before it acknowledges. */
    readonly stopped: readonly (readonly [Finalizer, number])[];
    /** The copies of strings' records its stops hold, let go once the thread acknowledges. */
    readonly strings: number[];
    acknowledged: boolean;
};

/** The world's end of a joined thread's stop lists. */
export type StopWriter = {
    readonly memory: Memory;
    readonly log: MoveLog;
    /** The world's records of strings, which stops copy. */
    readonly strings: StringStore | null;
    /** Finalizers with stops this sync point, in order, whose block is written once every finalizer ran. */
    readonly staged: StopsOf[];
    readonly written: Written[];
    /** Whether a block was written since the thread was last woken. */
    unwoken: boolean;
};

export const createStopWriter = (memory: Memory, log: MoveLog, strings: StringStore | null): StopWriter => ({ memory, log, strings, staged: [], written: [], unwoken: false });

/**
 * Indexes of entities despawned with stops of joined threads' finalizers: by index, how many threads haven't
 * acknowledged the stop, so the sync point kills them without releasing them; and how many are held.
 */
export type Holds = { counts: Int32Array; size: number };

export const createHolds = (): Holds => ({ counts: new Int32Array(0), size: 0 });

const hold = (holds: Holds, index: number): void => {
    if (index >= holds.counts.length) {
        const counts = new Int32Array(Math.max(index + 1, 2 * holds.counts.length, 1024));
        counts.set(holds.counts);
        holds.counts = counts;
    }
    if (holds.counts[index]++ === 0) holds.size++;
};

/**
 * Writes the handles of copies of a string's records at word `at`, for a group's `count` stops at the archetypes and
 * rows its words there name, keeping each copy in `copied`. Copying may grow the memory, which leaves `u32` over the
 * block as it was: it's shared.
 */
const copyStrings = (strings: StringStore, copied: number[], u32: Uint32Array, at: number, count: number, archetypeWords: number, rowWords: number, id: number, archetypes: StopSource["archetypes"]): void => {
    let archetype = -1;
    let handles: Uint32Array | undefined;
    for (let i = 0; i < count; i++) {
        if (u32[archetypeWords + i] !== archetype) {
            archetype = u32[archetypeWords + i];
            handles = archetypes[archetype].storageById[id]?.views.u32;
        }
        if (handles === undefined) continue;
        const copy = strings.copy(handles[u32[rowWords + i]]);
        copied.push(copy);
        u32[at + i] = copy;
    }
};

/** A storage as stops are copied from it: its tags, or its linear values. */
type Copied = { readonly tags: Uint32Array; readonly views: { readonly u8: Uint8Array; readonly u32: Uint32Array } };

/** What a sync point's stops come from: entries' entities and archetypes before apply, and the entity table's rows. */
export type StopSource = {
    readonly entity: Float64Array;
    readonly from: Int32Array;
    readonly despawned: Uint8Array;
    readonly archetypes: readonly { readonly storageById: readonly (Copied | undefined)[] }[];
    readonly row: Uint32Array;
    readonly holds: Holds;
};

/**
 * Writes the block of a sync point's staged stops, before it applies: entities, archetypes and rows, tags and linear
 * values, copied from the rows they're at, a column at a time; despawned entities' indexes held. Links it after the
 * last block.
 */
export const writeStops = (writer: StopWriter, sync: number, source: StopSource): void => {
    const { staged, memory } = writer;
    if (staged.length === 0) return;
    let bytes = blockHeaderBytes;
    for (const stops of staged) bytes += groupBytes(stops.entries.length, stops.objects.length, stops.strides);
    const offset = memory.allocate(bytes);
    const buffer = memory.memory.buffer;
    const u8 = new Uint8Array(buffer);
    const u32 = new Uint32Array(buffer);
    const f64 = new Float64Array(buffer);
    const held: number[] = [];
    const stopped: (readonly [Finalizer, number])[] = [];
    const copied: number[] = [];
    u32[(offset >> 2) + blockSyncWord] = sync >>> 0;
    u32[(offset >> 2) + blockNextWord] = 0;
    u32[(offset >> 2) + blockGroupsWord] = staged.length;
    u32[(offset >> 2) + blockBytesWord] = bytes;
    let group = offset + blockHeaderBytes;
    const { entity, from, despawned, archetypes, row: rows, holds } = source;
    for (const stops of staged) {
        const { entries, objects, linear, strides, copies } = stops;
        const count = entries.length;
        const size = groupBytes(count, objects.length, strides);
        u32[(group >> 2) + groupIndexWord] = stops.index;
        u32[(group >> 2) + groupCountWord] = count;
        u32[(group >> 2) + groupBytesWord] = size;
        const entityWords = entitiesAt(group) >> 3;
        const archetypeWords = archetypesAt(group, count) >> 2;
        const rowWords = rowsAt(group, count) >> 2;
        for (let i = 0; i < count; i++) {
            const entry = entries[i];
            const stoppedEntity = entity[entry];
            const index = stoppedEntity >>> 0;
            f64[entityWords + i] = stoppedEntity;
            u32[archetypeWords + i] = from[entry];
            u32[rowWords + i] = rows[index];
            if (despawned[entry] === 1) {
                hold(holds, index);
                held.push(index);
            }
        }
        for (let k = 0; k < objects.length; k++) {
            const tagWords = tagsAt(group, count, k) >> 2;
            const id = objects[k];
            let archetype = -1;
            let tags: Uint32Array | undefined;
            for (let i = 0; i < count; i++) {
                if (u32[archetypeWords + i] !== archetype) {
                    archetype = u32[archetypeWords + i];
                    tags = archetypes[archetype].storageById[id]?.tags;
                }
                u32[tagWords + i] = tags?.[u32[rowWords + i]] ?? 0;
            }
        }
        let column = valuesAt(group, count, objects.length);
        for (let k = 0; k < linear.length; k++) {
            const stride = strides[k];
            const id = linear[k];
            const words = (stride & 3) === 0 ? stride >> 2 : 0;
            let archetype = -1;
            let values: Copied["views"] | undefined;
            if (copies[k] && writer.strings !== null) {
                copyStrings(writer.strings, copied, u32, column >> 2, count, archetypeWords, rowWords, id, archetypes);
                column += columnBytes(count, stride);
                continue;
            }
            for (let i = 0; i < count; i++) {
                if (u32[archetypeWords + i] !== archetype) {
                    archetype = u32[archetypeWords + i];
                    values = archetypes[archetype].storageById[id]?.views;
                }
                if (values === undefined) continue;
                const row = u32[rowWords + i];
                if (words > 0) {
                    const source = values.u32;
                    const target = (column >> 2) + i * words;
                    for (let w = 0; w < words; w++) u32[target + w] = source[row * words + w];
                }
                else {
                    const source = values.u8;
                    const target = column + i * stride;
                    for (let b = 0; b < stride; b++) u8[target + b] = source[row * stride + b];
                }
            }
            column += columnBytes(count, stride);
        }
        stopped.push([stops.finalizer, count]);
        group += size;
        entries.length = 0;
    }
    staged.length = 0;
    const last = writer.written.at(-1);
    // Stored last, so the thread reads the block only once it's whole.
    if (last === undefined) Atomics.store(writer.log.header, logStopsWord, offset);
    else Atomics.store(u32, (last.offset >> 2) + blockNextWord, offset);
    writer.written.push({ offset, bytes, sync: sync >>> 0, held, stopped, strings: copied, acknowledged: false });
    writer.unwoken = true;
};

/** Lets go of the copies of strings' records a block's stops hold. */
const letGo = (writer: StopWriter, block: Written): void => {
    const { strings } = writer;
    if (strings !== null) for (let k = 0; k < block.strings.length; k++) strings.retire(block.strings[k]);
    block.strings.length = 0;
};

/** Returns a held index once no thread finalizes it any more: it's reusable after the sync point. */
const unhold = (holds: Holds, released: number[], held: readonly number[]): void => {
    const { counts } = holds;
    for (const index of held) {
        if (--counts[index] !== 0) continue;
        holds.size--;
        released.push(index);
    }
};

/**
 * Takes up what the thread acknowledged: blocks through the sync it finalized through return their held indexes, and
 * all but the newest of them are freed, since the thread reads the next block's offset from that one.
 */
export const settleStops = (writer: StopWriter, holds: Holds, released: number[]): void => {
    const { written, memory } = writer;
    if (written.length === 0) return;
    const finalized = Atomics.load(writer.log.header, logFinalizedWord) >>> 0;
    let newest = -1;
    for (let k = 0; k < written.length; k++) {
        const block = written[k];
        if (((finalized - block.sync) | 0) < 0) break;
        if (!block.acknowledged) {
            block.acknowledged = true;
            unhold(holds, released, block.held);
            letGo(writer, block);
        }
        newest = k;
    }
    for (let k = 0; k < newest; k++) memory.free(written[k].offset, written[k].bytes);
    if (newest > 0) written.splice(0, newest);
};

/**
 * Once the thread is gone: every held index returns, and each finalizer with stops it never acknowledged is a `"thread"`
 * failure, for the next sync point's report.
 */
export const endStops = (writer: StopWriter, holds: Holds, released: number[], label: string): { readonly finalizer: Finalizer; readonly error: Error; readonly kind: "thread" }[] => {
    settleStops(writer, holds, released);
    const missed = new Map<Finalizer, number>();
    for (const block of writer.written) {
        if (block.acknowledged) continue;
        block.acknowledged = true;
        unhold(holds, released, block.held);
        letGo(writer, block);
        for (const [finalizer, count] of block.stopped) missed.set(finalizer, (missed.get(finalizer) ?? 0) + count);
    }
    return [...missed].map(([finalizer, count]) => ({
        finalizer, kind: "thread",
        error: new Error(`Thread "${label}" is gone, so ${count === 1 ? "a stop" : `${count} stops`} of finalizer "${finalizer.name}" didn't run there.`),
    }));
};

/** Frees every block once the thread left: one that died may still be reading them. */
export const freeStops = (writer: StopWriter): void => {
    for (const block of writer.written) writer.memory.free(block.offset, block.bytes);
    writer.written.length = 0;
};
