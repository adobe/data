import { viewsOf, type Layout, type Views } from '../../interface/registry/layout.js';
import type { Memory } from './memory.js';

/**
 * A mailbox: a triple buffer in shared memory, by which the world's thread gives a joined thread an observer's newest
 * value. Its control words are the shared index, the slot neither side holds with a fresh bit, then each slot's offset
 * and capacity in bytes. The writer fills the slot it holds and exchanges it for the shared one, marked fresh,
 * so it never waits; the reader exchanges the one it holds for a fresh one, so it takes the newest complete value and
 * skips any it fell behind. Only the writer grows a slot, the one it holds, so the slot the reader holds never moves.
 */
export const mailboxWords = 7;
const indexWord = 0;
const offsetField = 0;
const capacityField = 1;
const fresh = 4;
const slotMask = 3;

/** The first control word of a slot's offset and capacity. */
const headerOf = (slot: number): number => 1 + slot * 2;

/** Slot views made once per block, and again only when the block or the buffer changes. */
type CachedViews = { buffer: ArrayBufferLike | null; offset: number; capacity: number; views: Views | null };

const cachedViews = (): CachedViews => ({ buffer: null, offset: -1, capacity: -1, views: null });

const viewsFor = (cache: CachedViews, buffer: ArrayBufferLike, offset: number, capacity: number): Views => {
    if (cache.views !== null && cache.buffer === buffer && cache.offset === offset && cache.capacity === capacity) return cache.views;
    cache.buffer = buffer;
    cache.offset = offset;
    cache.capacity = capacity;
    return cache.views = viewsOf(buffer, offset, capacity);
};

/** The world's end: the slot it holds, and the blocks of all three, which it allocated. */
export type MailboxWriter = {
    readonly memory: Memory;
    readonly offset: number;
    readonly control: Int32Array;
    back: number;
    readonly cache: readonly CachedViews[];
};

/** A mailbox in the world's memory, holding nothing yet. */
export const createMailbox = (memory: Memory): MailboxWriter => {
    const offset = memory.allocate(mailboxWords * 4);
    const control = new Int32Array(memory.memory.buffer, offset, mailboxWords).fill(0);
    // The writer holds slot 0, the reader slot 2, and slot 1 is shared, holding nothing fresh.
    control[indexWord] = 1;
    return { memory, offset, control, back: 0, cache: [cachedViews(), cachedViews(), cachedViews()] };
};

/** Views of the slot the writer holds, grown to at least `bytes`, its old block freed; 8 bytes at least. */
export const writeSlot = (writer: MailboxWriter, bytes: number): Views => {
    const { memory, back, control } = writer;
    const header = headerOf(back);
    let capacity = control[header + capacityField];
    let offset = control[header + offsetField];
    if (capacity < bytes) {
        if (capacity > 0) memory.free(offset, capacity);
        capacity = Math.max(64, 2 ** Math.ceil(Math.log2(bytes)));
        // Allocating may grow the memory; views of the buffer from before still reach the control words.
        offset = memory.allocate(capacity);
        control[header + offsetField] = offset;
        control[header + capacityField] = capacity;
    }
    return viewsFor(writer.cache[back], memory.memory.buffer, offset, capacity);
};

/** Publishes the slot the writer holds, once written, and takes the shared one in its place. */
export const publishSlot = (writer: MailboxWriter): void => {
    writer.back = Atomics.exchange(writer.control, indexWord, writer.back | fresh) & slotMask;
};

/** Returns a mailbox's blocks to the memory, once no thread reads it. */
export const freeMailbox = (writer: MailboxWriter): void => {
    const { memory, control } = writer;
    for (let slot = 0; slot < 3; slot++) {
        const capacity = control[headerOf(slot) + capacityField];
        if (capacity > 0) memory.free(control[headerOf(slot) + offsetField], capacity);
    }
    memory.free(writer.offset, mailboxWords * 4);
};

/** A joined thread's end: the slot it holds. */
export type MailboxReader = { readonly control: Int32Array; front: number; readonly cache: readonly CachedViews[] };

export const mailboxReader = (buffer: ArrayBufferLike, offset: number): MailboxReader =>
    ({ control: new Int32Array(buffer, offset, mailboxWords), front: 2, cache: [cachedViews(), cachedViews(), cachedViews()] });

/** Views of the newest value, taking it, or null when nothing fresh arrived since the last. */
export const readSlot = (reader: MailboxReader, buffer: ArrayBufferLike): Views | null => {
    const { control } = reader;
    if ((Atomics.load(control, indexWord) & fresh) === 0) return null;
    const front = reader.front = Atomics.exchange(control, indexWord, reader.front) & slotMask;
    const header = headerOf(front);
    return viewsFor(reader.cache[front], buffer, control[header + offsetField], control[header + capacityField]);
};

/** Whether a value newer than the one the reader holds is waiting. */
export const hasFresh = (reader: MailboxReader): boolean => (Atomics.load(reader.control, indexWord) & fresh) !== 0;

/**
 * Where each listed component's value goes in an entity's slot: after the presence word and a flag byte each, at a
 * multiple of its stride, so it's row `offset / stride` of the slot's views; -1 for a value with no bytes.
 */
export type EntityPlan = { readonly offsets: readonly number[]; readonly bytes: number };

export const entityPlanOf = (layouts: readonly Layout[]): EntityPlan => {
    let cursor = 8 + layouts.length;
    const offsets = layouts.map(layout => {
        if (layout.kind !== "linear") return -1;
        const offset = Math.ceil(cursor / layout.stride) * layout.stride;
        cursor = offset + layout.stride;
        return offset;
    });
    return { offsets, bytes: Math.max(8, cursor) };
};

/** A linear value at byte `offset` of a slot, a multiple of its stride. */
export const writeValue = (views: Views, layout: Layout, offset: number, value: unknown): void => {
    if (layout.kind === "linear") layout.write(views, offset / layout.stride, value);
};

export const readValue = (views: Views, layout: Layout, offset: number): unknown =>
    layout.kind === "linear" ? layout.read(views, offset / layout.stride) : layout.kind === "constant" ? layout.value : undefined;

/** The first byte at or after `cursor` that's a multiple of a layout's stride. */
export const alignFor = (layout: Layout, cursor: number): number => layout.kind === "linear" ? Math.ceil(cursor / layout.stride) * layout.stride : cursor;
