import type { KernelCommands } from './kernel.js';
import type { Positional, SpawnBatch } from './staging.js';

export const spawnCommand = 0;
export const despawnCommand = 1;
export const addCommand = 2;
export const removeCommand = 3;

/** Rows `start` to `end` of a kernel's spawn batch, committed in its buffer's place in merge order. */
export type Staged = { batch: SpawnBatch; start: number; end: number };

/**
 * Commands as parallel arrays with explicit counts, reused between runs, so issuing a command allocates nothing.
 * Command `c` names components `ids[starts[c]]` up to the next command's start, with `values` alongside (unused for
 * `remove`). Workers build the same shape and post it back. A kernel's spawns are staged in batches instead, and its
 * buffer lists their rows in `staged`, which the sync point commits before any command.
 */
export type CommandBuffer = {
    count: number;
    kinds: Uint8Array;
    /** By command: the list of components a list add or remove names, by its index among the world's lists, or -1. */
    shapes: Int32Array;
    entities: Float64Array;
    starts: Int32Array;
    /** Components named so far, across commands. */
    named: number;
    ids: Int32Array;
    readonly values: unknown[];
    /** The first `stagedCount` entries are this buffer's; the rest are kept for reuse. */
    readonly staged: Staged[];
    stagedCount: number;
};

export const createBuffer = (capacity = 16): CommandBuffer => ({
    count: 0,
    kinds: new Uint8Array(capacity),
    shapes: new Int32Array(capacity),
    entities: new Float64Array(capacity),
    starts: new Int32Array(capacity),
    named: 0,
    ids: new Int32Array(capacity * 4),
    values: [],
    staged: [],
    stagedCount: 0,
});

/** No commands; never written. */
export const emptyBuffer: CommandBuffer = createBuffer(0);

export const clearBuffer = (buffer: CommandBuffer): void => {
    // Releases values for collection; the arrays keep their storage for the next run.
    buffer.values.fill(undefined, 0, buffer.named);
    buffer.count = 0;
    buffer.named = 0;
    buffer.stagedCount = 0;
};

/** Adds rows `start` to `end` of a batch to the buffer's staged spawns. */
export const stage = (buffer: CommandBuffer, batch: SpawnBatch, start: number, end: number): void => {
    const entry = buffer.staged[buffer.stagedCount];
    if (entry === undefined) buffer.staged.push({ batch, start, end });
    else {
        entry.batch = batch;
        entry.start = start;
        entry.end = end;
    }
    buffer.stagedCount++;
};

const grown = <T extends Uint8Array | Float64Array | Int32Array>(array: T, create: (length: number) => T): T => {
    const larger = create(array.length * 2);
    larger.set(array);
    return larger;
};

/** Starts a command; name its components with `pushComponent` right after. */
export const pushCommand = (buffer: CommandBuffer, kind: number, entity: number): void => {
    if (buffer.count === buffer.kinds.length) {
        buffer.kinds = grown(buffer.kinds, length => new Uint8Array(length));
        buffer.shapes = grown(buffer.shapes, length => new Int32Array(length));
        buffer.entities = grown(buffer.entities, length => new Float64Array(length));
        buffer.starts = grown(buffer.starts, length => new Int32Array(length));
    }
    buffer.kinds[buffer.count] = kind;
    buffer.shapes[buffer.count] = -1;
    buffer.entities[buffer.count] = entity;
    buffer.starts[buffer.count] = buffer.named;
    buffer.count++;
};

export const pushComponent = (buffer: CommandBuffer, id: number, value: unknown): void => {
    if (buffer.named === buffer.ids.length) buffer.ids = grown(buffer.ids, length => new Int32Array(length));
    buffer.ids[buffer.named] = id;
    buffer.values[buffer.named] = value;
    buffer.named++;
};

export const endOf = (buffer: CommandBuffer, command: number): number =>
    command + 1 < buffer.count ? buffer.starts[command + 1] : buffer.named;

/**
 * Commands for a kernel, writing straight into a buffer: `ids` maps the kernel's key indexes to component ids, and
 * `starts` to what each starts at, written for an `undefined` value. `target.buffer` may be replaced between calls.
 * `spawners` stage the kernel's spawns, by spawn list.
 */
export const createKernelCommands = (target: { readonly buffer: CommandBuffer }, ids: readonly number[], starts: readonly unknown[], spawners: readonly Positional[]): KernelCommands => ({
    spawners,
    begin: (kind, entity) => pushCommand(target.buffer, kind, entity),
    value: (key, value) => pushComponent(target.buffer, ids[key], value === undefined ? starts[key] : value),
    component: key => pushComponent(target.buffer, ids[key], undefined),
});
