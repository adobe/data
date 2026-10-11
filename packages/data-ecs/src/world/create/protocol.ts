import type { Entity } from '../../entity/entity.js';
import type { Schema } from '../../schema/schema.js';
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

/** `column` is the byte offset of the component's interleaved column, or -1 when it stores nothing in linear memory. */
export type StorageLayout = {
    readonly id: number;
    readonly column: number;
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
    readonly added: readonly number[];
    readonly changed: readonly number[];
    /** The compiled WASM version, which workers instantiate against the shared memory and prefer. */
    readonly wasm: { readonly module: WebAssembly.Module; readonly scalars: readonly WasmScalar[]; readonly imports: readonly string[] } | null;
};

/** Messages are handled in order, so a layout always arrives before the tasks that depend on it. */
export type ToWorker =
    | { readonly kind: "memory"; readonly memory: WebAssembly.Memory }
    /** Wait on this worker's task ring in shared memory until asked to leave. Offsets are bytes into the memory. */
    | { readonly kind: "window"; readonly control: number; readonly statuses: number; readonly payloads: number; readonly worker: number; readonly epoch: number }
    | { readonly kind: "layout"; readonly schemas: readonly (readonly [number, Schema])[]; readonly entities: EntitiesLayout; readonly archetypes: readonly ArchetypeLayout[] }
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
    };

export type WorkerError = { readonly name: string; readonly message: string; readonly stack?: string };

/** A failed task still returns the commands it issued before failing, as the main thread would apply them. */
export type FromWorker =
    | { readonly kind: "done"; readonly task: number; readonly commands: CommandBuffer }
    | { readonly kind: "failed"; readonly task: number; readonly commands: CommandBuffer; readonly error: WorkerError };

/** Tasks a worker's ring holds, and f64 words per task: eight fields (the last is the window epoch), then scalars. */
export const ringSize = 64;
export const taskWords = 32;
export const maximumScalars = taskWords - 8;
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
export const controlWords = 4;
