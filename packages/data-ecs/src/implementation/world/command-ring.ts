import { viewsOf, type Layout, type Views } from '../../interface/registry/layout.js';
import { emptyViews } from './arrays.js';
import { writeF32, writeF32Lanes, writeF64, writeI32, writeOf, writeU32 } from './archetype.js';
import { fitDrained, stage, type CommandBuffer } from './buffer.js';
import type { SpawnBatch } from './staging.js';

// A pool worker's command ring (threads.md, "Command rings"): records a worker writes into shared memory for the world's
// thread to drain at the sync point. Every record starts on 8 bytes. A task's segment starts with its merge tag, then
// holds its commands in issue order, then its staged spawn batches and the reservation ranges it left unused.

/** Record kinds. Commands are 1 to 3, as `CommandBuffer.kinds`: kind and component count, a word, then the entity. */
const tagRecord = 8;
const spawnRecord = 9;
const unusedRecord = 10;

/**
 * How a command's component entry carries its value: an id word, this word, then its data. A struct is its bytes in its
 * storage's layout; any other value is a tag the world resolves: start, `null`, a number or a boolean.
 */
const noValue = 0;
const startValue = 1;
const nullValue = 2;
const numberValue = 3;
const falseValue = 4;
const trueValue = 5;
const bytesValue = 6;

/** The bytes a merge tag takes: kind, archetype, tick, first row. */
const tagBytes = 24;

const padded = (bytes: number): number => (bytes + 7) & ~7;

/** A task's merge tag: its system's run, by the tick it took, and its chunk, by archetype and first row. */
export type MergeTag = { readonly tick: number; readonly archetype: number; readonly start: number };

/**
 * A task's segment, as the world's thread receives it: its records in the ring, then those it wrote past the ring's
 * size into a spill, and the merge tag the world gave the task.
 */
export type Segment = { readonly ring: Uint8Array; readonly spill: Uint8Array | null; readonly tag: MergeTag };

/** How a worker writes one component's values: its layout, write kind and placement, and its bytes rounded up to 8. */
export type Encoder = { readonly layout: Layout; readonly write: number; readonly unitOffset: number; readonly lanes: number; readonly stride: number; readonly padded: number };

export const encoderOf = (layout: Layout): Encoder => {
    const { write, unitOffset, lanes } = writeOf(layout);
    const stride = layout.kind === "linear" ? layout.stride : 0;
    return { layout, write, unitOffset, lanes, stride, padded: padded(stride) };
};

/**
 * A spawn batch's object column holds this for a value left out, which the world resolves to the component's start.
 * Only the worker that staged it reads it.
 */
export const objectStart = Symbol("objectStart");

/** One component's value in a general layout, written at row 0, to copy into a record; grown for larger layouts. */
let scratch = viewsOf(new ArrayBuffer(256), 0, 256);
const scratchFor = (bytes: number): Views => {
    if (bytes > scratch.u8.length) scratch = viewsOf(new ArrayBuffer(padded(bytes * 2)), 0, padded(bytes * 2));
    return scratch;
};

/**
 * Where a worker's task writes: its ring in the memory, from `first` past `base`, until `capacity`; then a spill of its
 * own, which its completion message carries.
 */
export type RingWriter = {
    memory: Views;
    base: number;
    capacity: number;
    first: number;
    /** The views written: the memory's, or the spill's once the ring is full. */
    views: Views;
    at: number;
    limit: number;
    spill: Views | null;
    /** The spill's buffer, which its completion message transfers. */
    spillBuffer: ArrayBuffer | null;
    /** Past `base`, where the ring part ended once the task spilled. */
    ringEnd: number;
    /** The open command's first byte, whose component count each entry raises; -1 for none. */
    head: number;
};

export const createRingWriter = (): RingWriter => ({ memory: emptyViews, base: 0, capacity: 0, first: 0, views: emptyViews, at: 0, limit: 0, spill: null, spillBuffer: null, ringEnd: 0, head: -1 });

/** A spill's smallest size. */
const spillBytes = 1 << 16;

/** Moves the write position to the spill, with the open command, or grows the spill, to fit `bytes` more. */
const overflow = (writer: RingWriter, bytes: number): void => {
    const from = writer.spill !== null ? 0 : writer.head >= 0 ? writer.head : writer.at;
    const kept = writer.at - from;
    const size = Math.max(spillBytes, padded(2 * (kept + bytes)));
    const buffer = new ArrayBuffer(size);
    const spill = viewsOf(buffer, 0, size);
    spill.u8.set(writer.views.u8.subarray(from, writer.at));
    writer.spillBuffer = buffer;
    if (writer.spill === null) writer.ringEnd = from - writer.base;
    if (writer.head >= 0) writer.head -= from;
    writer.views = writer.spill = spill;
    writer.at = kept;
    writer.limit = size;
};

/** The first of the next `bytes` to write. */
const reserve = (writer: RingWriter, bytes: number): number => {
    if (writer.at + bytes > writer.limit) overflow(writer, bytes);
    const at = writer.at;
    writer.at += bytes;
    return at;
};

/** Starts a task's segment at `cursor` past the ring's base, with its merge tag. */
export const startSegment = (writer: RingWriter, memory: Views, base: number, capacity: number, cursor: number, tag: MergeTag): void => {
    writer.memory = writer.views = memory;
    writer.base = base;
    writer.capacity = capacity;
    writer.first = cursor;
    writer.at = base + cursor;
    writer.limit = base + capacity;
    writer.spill = null;
    writer.spillBuffer = null;
    writer.head = -1;
    const at = reserve(writer, tagBytes);
    const { u32, f64 } = writer.views;
    u32[at >> 2] = tagRecord;
    u32[(at >> 2) + 1] = tag.archetype;
    f64[(at >> 3) + 1] = tag.tick;
    f64[(at >> 3) + 2] = tag.start;
};

/** Where a task's segment is: its extent past the ring's base, and its spill's bytes and their buffer, or null. */
export type Extent = { readonly start: number; readonly end: number; readonly spill: Uint8Array | null; readonly transfer: ArrayBuffer | null };

/** No segment, for a task that failed before starting one. */
export const noExtent: Extent = { start: 0, end: 0, spill: null, transfer: null };

export const segmentExtent = (writer: RingWriter): Extent => writer.spillBuffer === null
    ? { start: writer.first, end: writer.at - writer.base, spill: null, transfer: null }
    : { start: writer.first, end: writer.ringEnd, spill: new Uint8Array(writer.spillBuffer, 0, writer.at), transfer: writer.spillBuffer };

/** Starts a despawn (1), add (2) or remove (3); its components follow. */
export const beginCommand = (writer: RingWriter, kind: number, entity: number): void => {
    // A command is complete once the next one starts, so a spill takes only the open one along.
    writer.head = -1;
    const at = reserve(writer, 16);
    writer.head = at;
    const { u32, f64 } = writer.views;
    u32[at >> 2] = kind;
    u32[(at >> 2) + 1] = 0;
    f64[(at >> 3) + 1] = entity;
};

/** Adds a component entry to the open command, returning its data's first byte. */
const entry = (writer: RingWriter, id: number, how: number, data: number): number => {
    const at = reserve(writer, 8 + data);
    const { u32 } = writer.views;
    u32[at >> 2] = id;
    u32[(at >> 2) + 1] = how;
    // The count is above the kind's byte.
    u32[writer.head >> 2] += 256;
    return at + 8;
};

/** A component of the open remove. */
export const putComponent = (writer: RingWriter, id: number): void => void entry(writer, id, noValue, 0);

/** A component of the open add left out: its start, which the world resolves. */
export const putStart = (writer: RingWriter, id: number): void => void entry(writer, id, startValue, 0);

/** Writes a value of a linear layout at byte `at`: numbers and f32 lane tuples straight in, the rest through the layout. */
const writeLinear = (views: Views, at: number, encoder: Encoder, value: unknown): void => {
    const index = (at >> 2) + encoder.unitOffset;
    switch (encoder.write) {
        case writeF32: if (typeof value === "number") return void (views.f32[index] = value); break;
        case writeU32: if (typeof value === "number") return void (views.u32[index] = value); break;
        case writeI32: if (typeof value === "number") return void (views.i32[index] = value); break;
        case writeF64: if (typeof value === "number") return void (views.f64[(at >> 3) + encoder.unitOffset] = value); break;
        case writeF32Lanes:
            if (Array.isArray(value)) {
                for (let lane = 0; lane < encoder.lanes; lane++) views.f32[index + lane] = Number(value[lane]);
                return;
            }
    }
    const { layout, stride } = encoder;
    if (layout.kind !== "linear") return;
    const general = scratchFor(stride);
    layout.write(general, 0, value);
    views.u8.set(general.u8.subarray(0, stride), at);
};

/** What tag an object component's value takes, or -1 for one only the world's thread could hold. */
const objectTag = (value: unknown): number =>
    value === objectStart || value === undefined ? startValue : value === null ? nullValue : typeof value === "number" ? numberValue
        : value === false ? falseValue : value === true ? trueValue : -1;

const unencodable = (id: number): Error =>
    new Error(`A kernel on a worker gave component ${id}, which isn't stored in linear memory, a value other than its start, null, a number or a boolean.`);

/** A component of the open add and its value: a struct's bytes, or an object's tag. */
export const putValue = (writer: RingWriter, id: number, encoder: Encoder, value: unknown): void => {
    const { layout } = encoder;
    if (layout.kind === "linear") {
        const at = entry(writer, id, bytesValue, encoder.padded);
        writeLinear(writer.views, at, encoder, value);
        return;
    }
    if (layout.kind === "constant") return putStart(writer, id);
    const tag = objectTag(value);
    if (tag < 0) throw unencodable(id);
    const at = entry(writer, id, tag, tag === numberValue ? 8 : 0);
    if (tag === numberValue) writer.views.f64[at >> 3] = Number(value);
};

/** Copies a spawn batch's rows into the segment as one block, emptying it. */
export const putBatch = (writer: RingWriter, batch: SpawnBatch): void => {
    const { count, columns } = batch;
    if (count === 0) return;
    let bytes = 16 + padded(4 * columns.length) + 8 * count;
    for (const column of columns) {
        if (column.layout.kind === "linear") bytes += padded(count * column.stride);
        else if (column.layout.kind === "object") {
            for (let row = 0; row < count; row++) if (objectTag(column.values[row]) < 0) throw unencodable(column.id);
            bytes += 16 * count;
        }
    }
    writer.head = -1;
    let at = reserve(writer, bytes);
    const { u8, u32, f64 } = writer.views;
    u32[at >> 2] = spawnRecord;
    u32[(at >> 2) + 1] = count;
    u32[(at >> 2) + 2] = columns.length;
    u32[(at >> 2) + 3] = 0;
    at += 16;
    for (let c = 0; c < columns.length; c++) u32[(at >> 2) + c] = columns[c].id;
    at += padded(4 * columns.length);
    f64.set(batch.entities.subarray(0, count), at >> 3);
    at += 8 * count;
    for (const column of columns) {
        if (column.layout.kind === "linear") {
            u8.set(column.views.u8.subarray(0, count * column.stride), at);
            at += padded(count * column.stride);
        }
        else if (column.layout.kind === "object") {
            for (let row = 0; row < count; row++, at += 16) {
                const value = column.values[row];
                u32[at >> 2] = objectTag(value);
                f64[(at >> 3) + 1] = typeof value === "number" ? value : 0;
            }
            column.values.fill(undefined, 0, count);
        }
    }
    batch.count = 0;
};

/** The reservation positions the task's block left unused, as start and end pairs. */
export const putUnused = (writer: RingWriter, unused: readonly number[]): void => {
    if (unused.length === 0) return;
    writer.head = -1;
    const at = reserve(writer, 8 + padded(4 * unused.length));
    const { u32 } = writer.views;
    u32[at >> 2] = unusedRecord;
    u32[(at >> 2) + 1] = unused.length;
    for (let k = 0; k < unused.length; k++) u32[(at >> 2) + 2 + k] = unused[k];
};

const tagValue = (how: number, f64: Float64Array, data: number, start: unknown): unknown => {
    switch (how) {
        case startValue: return start;
        case nullValue: return null;
        case numberValue: return f64[data >> 3];
        case falseValue: return false;
        case trueValue: return true;
        default: return undefined;
    }
};

/** A spawn block's rows as a batch over the segment, to commit as the world thread's own. */
const decodeBatch = (views: Views, at: number, layouts: readonly Layout[], starts: readonly unknown[]): { readonly batch: SpawnBatch; readonly end: number } => {
    const { u32, f64 } = views;
    const count = u32[(at >> 2) + 1];
    const width = u32[(at >> 2) + 2];
    let next = at + 16;
    const ids: number[] = [];
    for (let c = 0; c < width; c++) ids.push(u32[(next >> 2) + c]);
    next += padded(4 * width);
    const { buffer, byteOffset } = views.u8;
    const entities = new Float64Array(buffer, byteOffset + next, count);
    next += 8 * count;
    const columns = ids.map(id => {
        const layout = layouts[id];
        const stride = layout.kind === "linear" ? layout.stride : 0;
        let columnViews = emptyViews;
        const values: unknown[] = [];
        if (layout.kind === "linear") {
            columnViews = viewsOf(buffer, byteOffset + next, count * stride);
            next += padded(count * stride);
        }
        else if (layout.kind === "object") {
            for (let row = 0; row < count; row++, next += 16) values.push(tagValue(u32[next >> 2], f64, next + 8, starts[id]));
        }
        return { id, layout, ...writeOf(layout), stride, views: columnViews, values };
    });
    return { batch: { ids, archetype: null, columns, entities, count, capacity: count }, end: next };
};

/**
 * Decodes a segment part's records into `buffer`, whose `bytes` become its views: commands with their structs' bytes
 * left in place, each spawn block staged as a batch over it, and unused reservation ranges appended to `unused`. With
 * `tag`, the first record must be that merge tag; returns false if it isn't, decoding nothing.
 */
export const decodeSegment = (buffer: CommandBuffer, views: Views, layouts: readonly Layout[], starts: readonly unknown[], unused: number[], tag: MergeTag | null): boolean => {
    const { u32, f64 } = views;
    const end = views.u8.length;
    let at = 0;
    if (tag !== null) {
        if (end < tagBytes || u32[0] !== tagRecord || u32[1] !== tag.archetype || f64[1] !== tag.tick || f64[2] !== tag.start) return false;
        at = tagBytes;
    }
    buffer.bytes = views;
    // A command takes at least 16 bytes and a component entry 8, so the arrays are fitted once and written straight in.
    fitDrained(buffer, (end - at) >> 4, (end - at) >> 3);
    const { kinds, shapes, entities, starts: firsts, ids, offsets, values } = buffer;
    let { count, named } = buffer;
    while (at < end) {
        const word = u32[at >> 2];
        const kind = word & 255;
        if (kind === spawnRecord) {
            buffer.count = count;
            buffer.named = named;
            const { batch, end: next } = decodeBatch(views, at, layouts, starts);
            stage(buffer, batch, 0, batch.count);
            at = next;
            continue;
        }
        if (kind === unusedRecord) {
            const pairs = u32[(at >> 2) + 1];
            for (let k = 0; k < pairs; k++) unused.push(u32[(at >> 2) + 2 + k]);
            at += 8 + padded(4 * pairs);
            continue;
        }
        if (kind === tagRecord) {
            at += tagBytes;
            continue;
        }
        kinds[count] = kind;
        shapes[count] = -1;
        entities[count] = f64[(at >> 3) + 1];
        firsts[count] = named;
        count++;
        at += 16;
        for (let n = word >>> 8; n > 0; n--) {
            const id = u32[at >> 2];
            const how = u32[(at >> 2) + 1];
            at += 8;
            ids[named] = id;
            if (how === bytesValue) {
                const layout = layouts[id];
                offsets[named] = at;
                values[named++] = undefined;
                at += padded(layout.kind === "linear" ? layout.stride : 0);
                continue;
            }
            offsets[named] = -1;
            values[named++] = tagValue(how, f64, at, starts[id]);
            if (how === numberValue) at += 8;
        }
    }
    buffer.count = count;
    buffer.named = named;
    return true;
};
