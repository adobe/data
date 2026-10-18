import type { Entity } from '../../interface/entity/entity.js';
import type { Schema } from '../../interface/schema/schema.js';
import type { CommandBuffer } from './buffer.js';
import type { WasmScalar } from './wasm.js';

/** Byte offsets into the shared memory; the worker builds its own views over them. */
export type EntitiesLayout = {
    readonly cursor: number;
    readonly free: number;
    readonly freeCapacity: number;
    readonly archetype: number;
    readonly row: number;
    readonly generation: number;
    readonly capacity: number;
    readonly length: number;
};

/**
 * `column` is the byte offset of the component's interleaved column, or -1 when it stores nothing in linear memory.
 * Tick offsets mean something only when `ticked`.
 */
export type StorageLayout = {
    readonly id: number;
    readonly column: number;
    readonly ticked: boolean;
    readonly added: number;
    readonly changed: number;
    readonly chunkAdded: number;
    readonly chunkChanged: number;
    readonly chunks: number;
};

export type ArchetypeLayout = { readonly id: number; readonly capacity: number; readonly entities: number; readonly storages: readonly StorageLayout[] };

/** Where a kernel column comes from in any archetype it matches. */
export type Source = { readonly kind: "entity" } | { readonly kind: "field" | "changed" | "chunks"; readonly id: number; readonly leaf: number };

/** Component ids of one lookup. */
export type LookupSetup = { readonly read: readonly number[]; readonly has: readonly number[]; readonly not: readonly number[] };

export type KernelSetup = {
    readonly index: number;
    readonly url: string;
    readonly sources: readonly Source[];
    readonly booleans: readonly boolean[];
    readonly strides: readonly number[];
    readonly offsets: readonly number[];
    /** Tick columns nothing observes: they point at a dummy element. */
    readonly muted: readonly boolean[];
    readonly lookups: readonly LookupSetup[];
    /** Component ids, used as `keys` so command values name components by id. */
    readonly keys: readonly number[];
    /** By key index: what each component starts at when a command's value for it is `undefined`. */
    readonly starts: readonly unknown[];
    /** The component ids of each list the kernel spawns, in the order its spawner takes values. */
    readonly spawns: readonly (readonly number[])[];
    readonly added: readonly number[];
    readonly changed: readonly number[];
    /** For a kernel reading `up`: each parent column's boolean flag, stride and offset, the same in every archetype. */
    readonly up: { readonly booleans: readonly boolean[]; readonly strides: readonly number[]; readonly offsets: readonly number[] };
    /** Whether the kernel reduces: its fast tasks then carry their partials' address and stride after the scalars. */
    readonly reduces: boolean;
    /** The compiled WASM version, which workers instantiate against the shared memory and prefer. */
    readonly wasm: { readonly module: WebAssembly.Module; readonly scalars: readonly WasmScalar[]; readonly imports: readonly string[] } | null;
};

/** Messages are handled in order, so a layout always arrives before the tasks that depend on it. */
export type ToWorker =
    | { readonly kind: "memory"; readonly memory: WebAssembly.Memory }
    /** Wait on this worker's task ring in shared memory until asked to leave. Offsets are bytes into the memory. */
    | { readonly kind: "window"; readonly control: number; readonly statuses: number; readonly payloads: number; readonly claims: number; readonly worker: number; readonly epoch: number }
    | { readonly kind: "layout"; readonly schemas: readonly (readonly [number, Schema | undefined])[]; readonly entities: EntitiesLayout; readonly archetypes: readonly ArchetypeLayout[] }
    | { readonly kind: "kernels"; readonly task: number; readonly kernels: readonly KernelSetup[] }
    | {
        readonly kind: "run";
        readonly task: number;
        readonly kernel: number;
        readonly archetype: number;
        readonly start: number;
        readonly end: number;
        readonly tick: number;
        /** Rows pass only if a filtered tick is newer than this; `-1` passes every row. */
        readonly lastRun: number;
        readonly resources: readonly unknown[];
        readonly args: unknown;
        /** The byte address of this chunk's reduction partials, or -1 for a kernel without reductions. */
        readonly partials: number;
    };

export type WorkerError = { readonly name: string; readonly message: string; readonly stack?: string };

/**
 * A task's kernel spawns of one set of components, sorted `ids`, in issue order: by column, its rows' bytes in the
 * target storage's layout, or an object column's values; empty for the other kind.
 */
export type PostedSpawns = {
    readonly ids: readonly number[];
    readonly count: number;
    readonly entities: Float64Array;
    readonly bytes: readonly Uint8Array[];
    readonly values: readonly unknown[][];
};

/**
 * A task's commands, its staged spawns, and the reservation positions its block left unused, as start and end pairs.
 * A failed task still returns what it issued before failing, as the main thread would apply it.
 */
export type FromWorker =
    | { readonly kind: "done"; readonly task: number; readonly commands: CommandBuffer; readonly spawns: readonly PostedSpawns[]; readonly unused: readonly number[] }
    | { readonly kind: "failed"; readonly task: number; readonly commands: CommandBuffer; readonly spawns: readonly PostedSpawns[]; readonly unused: readonly number[]; readonly error: WorkerError };

/**
 * Tasks a worker's ring holds, and f64 words per task: twelve fields, then scalars. The fields are kernel, archetype,
 * start, end, tick, lastRun, the window epoch, the scalar count, then the split's claims: the line of its first range
 * word (-1 for none), the grain, this worker's participant index and the participant count. Without claims the task
 * runs `start` to `end`; with them it runs the `grain`-row pieces it claims (`claims.ts`).
 */
export const ringSize = 64;
export const taskWords = 32;
export const taskFields = 12;
export const maximumScalars = taskWords - taskFields;
/**
 * Int32 words per 128-byte cache line, the largest in use (Apple silicon). Words that different threads write each get
 * a line of their own, so a store by one doesn't invalidate the line another is polling.
 */
export const lineWords = 32;
/** Splits in flight with claims the pool holds room for: one range word per worker each, each on its own line. */
export const splitCount = 256;
/**
 * Control words per worker: tasks posted, tasks done, the window epoch, and a signal bumped on every post or close,
 * which the worker waits on, so a wake-up between its check and its wait isn't lost. Closing a window bumps the
 * epoch; a worker leaves its window when the epoch moves on, and runs only tasks posted in its own window's epoch,
 * so a task posted after a close waits until the worker has handled the messages sent before it.
 */
export const posted = 0;
export const done = 1;
export const epoch = 2;
export const signal = 3;
/** Each worker's control words take a whole line. */
export const controlWords = lineWords;
