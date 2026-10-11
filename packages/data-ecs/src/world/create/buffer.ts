import type { Entity } from '../../entity/entity.js';
import type { KernelCommands } from './kernel.js';

export const spawnCommand = 0;
export const despawnCommand = 1;
export const addCommand = 2;
export const removeCommand = 3;

/**
 * Commands as parallel arrays with explicit counts, reused between runs, so issuing a command allocates nothing.
 * Command `c` names components `ids[starts[c]]` up to the next command's start, with `values` alongside (unused for
 * `remove`). Workers build the same shape and post it back.
 */
export type CommandBuffer = {
    count: number;
    kinds: Uint8Array;
    entities: Float64Array;
    starts: Int32Array;
    /** Components named so far, across commands. */
    named: number;
    ids: Int32Array;
    readonly values: unknown[];
};

export const createBuffer = (capacity = 16): CommandBuffer => ({
    count: 0,
    kinds: new Uint8Array(capacity),
    entities: new Float64Array(capacity),
    starts: new Int32Array(capacity),
    named: 0,
    ids: new Int32Array(capacity * 4),
    values: [],
});

/** No commands; never written. */
export const emptyBuffer: CommandBuffer = createBuffer(0);

export const clearBuffer = (buffer: CommandBuffer): void => {
    // Releases values for collection; the arrays keep their storage for the next run.
    buffer.values.fill(undefined, 0, buffer.named);
    buffer.count = 0;
    buffer.named = 0;
};

const grown = <T extends Uint8Array | Float64Array | Int32Array>(array: T, create: (length: number) => T): T => {
    const larger = create(array.length * 2);
    larger.set(array);
    return larger;
};

/** Starts a command; name its components with `pushComponent` right after. */
export const pushCommand = (buffer: CommandBuffer, kind: number, entity: Entity): void => {
    if (buffer.count === buffer.kinds.length) {
        buffer.kinds = grown(buffer.kinds, length => new Uint8Array(length));
        buffer.entities = grown(buffer.entities, length => new Float64Array(length));
        buffer.starts = grown(buffer.starts, length => new Int32Array(length));
    }
    buffer.kinds[buffer.count] = kind;
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
 * Commands for a kernel, writing straight into a buffer: `ids` maps the kernel's key indexes to component ids.
 * `target.buffer` may be replaced between calls.
 */
export const createKernelCommands = (target: { readonly buffer: CommandBuffer }, ids: readonly number[], reserve: () => Entity): KernelCommands => ({
    spawn: () => {
        const entity = reserve();
        pushCommand(target.buffer, spawnCommand, entity);
        return entity;
    },
    begin: (kind, entity) => pushCommand(target.buffer, kind, entity),
    value: (key, value) => {
        if (value !== undefined) pushComponent(target.buffer, ids[key], value);
    },
    component: key => pushComponent(target.buffer, ids[key], undefined),
});
