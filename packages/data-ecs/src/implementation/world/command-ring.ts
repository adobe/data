import { viewsOf, type Layout, type Views } from '../../interface/registry/layout.js';
import { emptyViews } from './arrays.js';
import { writeF32, writeF32Lanes, writeF64, writeI32, writeOf, writeU32 } from './archetype.js';
import { stage, type CommandBuffer } from './buffer.js';
import type { SpawnBatch } from './staging.js';

// A pool worker's command ring (threads.md, "Command rings"): segments a worker writes into shared memory for the world's
// thread to drain at the sync point. A segment holds one task's commands as the columns of a `CommandBuffer`, so the world
// drains it by taking views of them, then its staged spawn batches as blocks and the reservation ranges it left unused.
//
// Layout, every region on 8 bytes: a header (the merge tag, then counts and sizes); entities, f64 by command; values'
// bytes; first components, i32 by command; component ids, i32 by component; offsets into the values' bytes, i32 by
// component, -1 for a value given by tag; kinds, u8 by command; tags, 16 bytes each (component, how, number); spawn
// blocks; unused reservation ranges, u32 pairs.

const segmentRecord = 8;
const headerBytes = 48;

/** How a tagged component's value comes: its start, `null`, a number or a boolean, which the world resolves. */
const startValue = 1;
const nullValue = 2;
const numberValue = 3;
const falseValue = 4;
const trueValue = 5;

const padded = (bytes: number): number => (bytes + 7) & ~7;

/** A task's merge tag: its system's run, by the tick it took, and its chunk, by archetype and first row. */
export type MergeTag = { readonly tick: number; readonly archetype: number; readonly start: number };

/** A task's segment, as the world's thread receives it: in the ring, or in a spill past the ring's size, and the merge tag the world gave the task. */
export type Segment = { readonly bytes: Uint8Array; readonly tag: MergeTag };

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

/** One component's value in a general layout, written at row 0, to copy into the values' bytes; grown for larger layouts. */
let scratch = viewsOf(new ArrayBuffer(256), 0, 256);
const scratchFor = (bytes: number): Views => {
    if (bytes > scratch.u8.length) scratch = viewsOf(new ArrayBuffer(padded(bytes * 2)), 0, padded(bytes * 2));
    return scratch;
};

/** A task's commands as a worker builds them, in columns of its own reused by every task, copied into the ring at its end. */
export type RingWriter = {
    tag: MergeTag;
    count: number;
    named: number;
    kinds: Uint8Array;
    entities: Float64Array;
    firsts: Int32Array;
    ids: Int32Array;
    offsets: Int32Array;
    /** Values' bytes, and the next free byte. */
    data: Views;
    used: number;
    /** Tagged values: by tag, the component it's at, how it comes and its number. */
    tagged: number;
    tagEntries: Int32Array;
    tagKinds: Int32Array;
    tagNumbers: Float64Array;
};

const noTag: MergeTag = { tick: 0, archetype: 0, start: 0 };

export const createRingWriter = (): RingWriter => ({
    tag: noTag, count: 0, named: 0,
    kinds: new Uint8Array(1024), entities: new Float64Array(1024), firsts: new Int32Array(1024),
    ids: new Int32Array(1024), offsets: new Int32Array(1024),
    data: viewsOf(new ArrayBuffer(8192), 0, 8192), used: 0,
    tagged: 0, tagEntries: new Int32Array(256), tagKinds: new Int32Array(256), tagNumbers: new Float64Array(256),
});

const doubled = <T extends Uint8Array | Float64Array | Int32Array>(array: T, create: (length: number) => T): T => {
    const larger = create(array.length * 2);
    larger.set(array);
    return larger;
};

/** Starts a task's commands, with its merge tag. */
export const startSegment = (writer: RingWriter, tag: MergeTag): void => {
    writer.tag = tag;
    writer.count = writer.named = writer.used = writer.tagged = 0;
};

/** Starts a despawn (1), add (2) or remove (3); its components follow. */
export const beginCommand = (writer: RingWriter, kind: number, entity: number): void => {
    const command = writer.count;
    if (command === writer.kinds.length) {
        writer.kinds = doubled(writer.kinds, length => new Uint8Array(length));
        writer.entities = doubled(writer.entities, length => new Float64Array(length));
        writer.firsts = doubled(writer.firsts, length => new Int32Array(length));
    }
    writer.kinds[command] = kind;
    writer.entities[command] = entity;
    writer.firsts[command] = writer.named;
    writer.count = command + 1;
};

/** A component of the open command, its value's offset or -1; returns its index. */
const component = (writer: RingWriter, id: number, offset: number): number => {
    const named = writer.named;
    if (named === writer.ids.length) {
        writer.ids = doubled(writer.ids, length => new Int32Array(length));
        writer.offsets = doubled(writer.offsets, length => new Int32Array(length));
    }
    writer.ids[named] = id;
    writer.offsets[named] = offset;
    writer.named = named + 1;
    return named;
};

/** A component of the open remove. */
export const putComponent = (writer: RingWriter, id: number): void => void component(writer, id, -1);

const tag = (writer: RingWriter, entry: number, how: number, number: number): void => {
    const tagged = writer.tagged;
    if (tagged === writer.tagEntries.length) {
        writer.tagEntries = doubled(writer.tagEntries, length => new Int32Array(length));
        writer.tagKinds = doubled(writer.tagKinds, length => new Int32Array(length));
        writer.tagNumbers = doubled(writer.tagNumbers, length => new Float64Array(length));
    }
    writer.tagEntries[tagged] = entry;
    writer.tagKinds[tagged] = how;
    writer.tagNumbers[tagged] = number;
    writer.tagged = tagged + 1;
};

/** A component of the open add left out: its start, which the world resolves. */
export const putStart = (writer: RingWriter, id: number): void => tag(writer, component(writer, id, -1), startValue, 0);

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
        const at = writer.used;
        const end = at + encoder.padded;
        if (end > writer.data.u8.length) {
            const length = Math.max(end, writer.data.u8.length * 2);
            const data = viewsOf(new ArrayBuffer(length), 0, length);
            data.u8.set(writer.data.u8.subarray(0, at));
            writer.data = data;
        }
        writer.used = end;
        component(writer, id, at);
        writeLinear(writer.data, at, encoder, value);
        return;
    }
    if (layout.kind === "constant") return putStart(writer, id);
    const how = objectTag(value);
    if (how < 0) throw unencodable(id);
    tag(writer, component(writer, id, -1), how, typeof value === "number" ? value : 0);
};

/** The bytes a spawn batch's block takes; throws for an object value the world can't take. */
const batchBytes = (batch: SpawnBatch): number => {
    const { count, columns } = batch;
    if (count === 0) return 0;
    let bytes = 16 + padded(4 * columns.length) + 8 * count;
    for (const column of columns) {
        if (column.layout.kind === "linear") bytes += padded(count * column.stride);
        else if (column.layout.kind === "object") {
            for (let row = 0; row < count; row++) if (objectTag(column.values[row]) < 0) throw unencodable(column.id);
            bytes += 16 * count;
        }
    }
    return bytes;
};

/** Copies a spawn batch's rows to byte `at` as one block, emptying it; returns the byte after it. */
const putBatch = (views: Views, start: number, batch: SpawnBatch): number => {
    const { count, columns } = batch;
    if (count === 0) return start;
    const { u8, u32, f64 } = views;
    let at = start;
    u32[at >> 2] = count;
    u32[(at >> 2) + 1] = columns.length;
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
    return at;
};

/** Where a task's segment is: its extent past the ring's base, or its spill and the spill's buffer. */
export type Extent = { readonly start: number; readonly end: number; readonly spill: Uint8Array | null; readonly transfer: ArrayBuffer | null };

/** No segment, for a task that failed before starting one. */
export const noExtent: Extent = { start: 0, end: 0, spill: null, transfer: null };

/**
 * Writes the task's segment: its commands' columns, then `batches` as blocks, emptying them, and `unused`, into the ring
 * at `cursor` past `base` when it fits before `capacity`, else into a spill of its own.
 */
export const endSegment = (writer: RingWriter, memory: Views, base: number, capacity: number, cursor: number, batches: readonly SpawnBatch[], unused: readonly number[]): Extent => {
    const { count: n, named: m, tagged, used } = writer;
    let spawnBytes = 0;
    for (const batch of batches) spawnBytes += batchBytes(batch);
    const columns = 8 * n + padded(used) + padded(4 * n) + 2 * padded(4 * m) + padded(n);
    const bytes = headerBytes + columns + 16 * tagged + spawnBytes + padded(4 * unused.length);
    const inRing = cursor + bytes <= capacity;
    const transfer = inRing ? null : new ArrayBuffer(bytes);
    const views = transfer === null ? memory : viewsOf(transfer, 0, bytes);
    const first = transfer === null ? base + cursor : 0;
    const { u8, u32, i32, f64 } = views;
    let at = first;
    u32[at >> 2] = segmentRecord;
    u32[(at >> 2) + 1] = writer.tag.archetype;
    f64[(at >> 3) + 1] = writer.tag.tick;
    f64[(at >> 3) + 2] = writer.tag.start;
    u32[(at >> 2) + 6] = n;
    u32[(at >> 2) + 7] = m;
    u32[(at >> 2) + 8] = used;
    u32[(at >> 2) + 9] = tagged;
    u32[(at >> 2) + 10] = spawnBytes;
    u32[(at >> 2) + 11] = unused.length;
    at += headerBytes;
    f64.set(writer.entities.subarray(0, n), at >> 3);
    at += 8 * n;
    u8.set(writer.data.u8.subarray(0, used), at);
    at += padded(used);
    i32.set(writer.firsts.subarray(0, n), at >> 2);
    at += padded(4 * n);
    i32.set(writer.ids.subarray(0, m), at >> 2);
    at += padded(4 * m);
    i32.set(writer.offsets.subarray(0, m), at >> 2);
    at += padded(4 * m);
    u8.set(writer.kinds.subarray(0, n), at);
    at += padded(n);
    for (let t = 0; t < tagged; t++, at += 16) {
        i32[at >> 2] = writer.tagEntries[t];
        i32[(at >> 2) + 1] = writer.tagKinds[t];
        f64[(at >> 3) + 1] = writer.tagNumbers[t];
    }
    for (const batch of batches) at = putBatch(views, at, batch);
    for (let k = 0; k < unused.length; k++) u32[(at >> 2) + k] = unused[k];
    return transfer === null
        ? { start: cursor, end: cursor + bytes, spill: null, transfer: null }
        : { start: cursor, end: cursor, spill: new Uint8Array(transfer), transfer };
};

const tagValue = (how: number, number: number, start: unknown): unknown => {
    switch (how) {
        case startValue: return start;
        case nullValue: return null;
        case numberValue: return number;
        case falseValue: return false;
        case trueValue: return true;
        default: return undefined;
    }
};

/** A spawn block's rows as a batch over the segment, to commit as the world thread's own. */
const decodeBatch = (views: Views, at: number, layouts: readonly Layout[], starts: readonly unknown[]): { readonly batch: SpawnBatch; readonly end: number } => {
    const { u32, f64 } = views;
    const count = u32[at >> 2];
    const width = u32[(at >> 2) + 1];
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
            for (let row = 0; row < count; row++, next += 16) values.push(tagValue(u32[next >> 2], f64[(next >> 3) + 1], starts[id]));
        }
        return { id, layout, ...writeOf(layout), stride, views: columnViews, values, remote: null };
    });
    return { batch: { ids, archetype: null, columns, entities, count, capacity: count }, end: next };
};

/** Read-only by every drained buffer: no command names a list. Grown to the most commands one segment held. */
let noShapes = new Int32Array(0);

/**
 * Drains a segment into `buffer`, whose columns become views of it: commands with their structs' bytes left in place,
 * tagged values resolved, each spawn block staged as a batch over it, and unused reservation ranges appended to
 * `unused`. The segment must start with `tag`; returns false if it doesn't, draining nothing.
 */
export const drainSegment = (buffer: CommandBuffer, bytes: Uint8Array, layouts: readonly Layout[], starts: readonly unknown[], unused: number[], tag: MergeTag): boolean => {
    const views = viewsOf(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const { u32, i32, f64 } = views;
    if (bytes.byteLength < headerBytes || u32[0] !== segmentRecord || u32[1] !== tag.archetype || f64[1] !== tag.tick || f64[2] !== tag.start) return false;
    const n = u32[6];
    const m = u32[7];
    const used = u32[8];
    const tagged = u32[9];
    const spawnBytes = u32[10];
    const unusedCount = u32[11];
    const { buffer: memory, byteOffset } = bytes;
    let at = headerBytes;
    buffer.entities = new Float64Array(memory, byteOffset + at, n);
    at += 8 * n;
    buffer.bytes = viewsOf(memory, byteOffset + at, used);
    at += padded(used);
    buffer.starts = new Int32Array(memory, byteOffset + at, n);
    at += padded(4 * n);
    buffer.ids = new Int32Array(memory, byteOffset + at, m);
    at += padded(4 * m);
    buffer.offsets = new Int32Array(memory, byteOffset + at, m);
    at += padded(4 * m);
    buffer.kinds = new Uint8Array(memory, byteOffset + at, n);
    at += padded(n);
    if (noShapes.length < n) noShapes = new Int32Array(Math.max(n, 2 * noShapes.length)).fill(-1);
    buffer.shapes = noShapes;
    buffer.count = n;
    buffer.named = m;
    // Values are read by every component, so the array covers them; only tagged ones hold any.
    const { values } = buffer;
    for (let k = values.length; k < m; k++) values.push(undefined);
    for (let t = 0; t < tagged; t++, at += 16) {
        const entry = i32[at >> 2];
        values[entry] = tagValue(i32[(at >> 2) + 1], f64[(at >> 3) + 1], starts[buffer.ids[entry]]);
    }
    const spawnEnd = at + spawnBytes;
    while (at < spawnEnd) {
        const { batch, end } = decodeBatch(views, at, layouts, starts);
        stage(buffer, batch, 0, batch.count);
        at = end;
    }
    for (let k = 0; k < unusedCount; k++) unused.push(u32[(at >> 2) + k]);
    return true;
};
