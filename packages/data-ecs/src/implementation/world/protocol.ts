import type { Schema } from '../../interface/schema/schema.js';
import type { Endpoint } from './port.js';
import type { WasmScalar } from './wasm.js';
import type { IndexReaderSetup } from './index-readers.js';

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
    /** By lookup through an index: its lookup, how its JS reader reads it, and how many components it watches. */
    readonly indexes: readonly { readonly lookup: number; readonly reader: IndexReaderSetup; readonly watched: number }[];
    /** Component ids, used as `keys` so command values name components by id. */
    readonly keys: readonly number[];
    /** By key index: what each component stored in linear memory starts at, for a spawn leaving it out; null for the rest, whose start the world resolves. */
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

/**
 * Messages are handled in order, so new components' schemas always arrive before the tasks that use them. Where
 * archetypes and the entity table are in the memory, workers read from the layout directory, whose header is at byte
 * `header` (`layout-directory.ts`).
 */
export type ToWorker =
    /** From a lent worker's owner, first: the port every later message arrives on and every reply goes to. */
    | { readonly kind: "port"; readonly port: Endpoint }
    /** The memory, its layout directory's header, and the byte offset of this worker's control words, its command ring's among them. */
    | { readonly kind: "memory"; readonly memory: WebAssembly.Memory; readonly header: number; readonly control: number }
    /** Wait on this worker's task ring in shared memory until asked to leave. Offsets are bytes into the memory. */
    | { readonly kind: "window"; readonly control: number; readonly statuses: number; readonly payloads: number; readonly claims: number; readonly worker: number; readonly epoch: number }
    /** New components' schemas; none for a value that isn't data. */
    | { readonly kind: "layout"; readonly schemas: readonly (readonly [number, Schema | undefined])[] }
    | { readonly kind: "kernels"; readonly task: number; readonly kernels: readonly KernelSetup[] }
    /** For tests of what a world holds: how many kernels this worker keeps. */
    | { readonly kind: "tables"; readonly task: number }
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
        /** A WASM kernel's lookup parameters, and its lookups through indexes', which JS kernels' readers read too. */
        readonly lookups: readonly number[];
        readonly indexes: readonly number[];
    };

export type WorkerError = { readonly name: string; readonly message: string; readonly stack?: string };

/**
 * A task's completion: its segment of the worker's command ring, as start and end bytes past the ring's base, and what
 * it wrote past the ring's size, or null (`command-ring.ts`). A failed task's segment holds what it issued before failing,
 * which applies, as the main thread's would.
 */
export type FromWorker =
    | { readonly kind: "done"; readonly task: number; readonly start: number; readonly end: number; readonly spill: Uint8Array | null }
    | { readonly kind: "failed"; readonly task: number; readonly start: number; readonly end: number; readonly spill: Uint8Array | null; readonly error: WorkerError }
    | { readonly kind: "tables"; readonly task: number; readonly kernels: number };

/**
 * Tasks a worker's ring holds, and f64 words per task: twelve fields, then scalars. The fields are kernel, archetype,
 * start, end, tick, lastRun, the window epoch, the scalar count, then the split's claims: the line of its first range
 * word (-1 for none), the grain, this worker's participant index and the participant count. Without claims the task
 * runs `start` to `end`; with them it runs the `grain`-row pieces it claims (`claims.ts`).
 */
export const ringSize = 64;
/** A ring task's kernel that runs nothing: a round trip to the worker and back, as the `wake` benchmark measures. */
export const idleKernel = -1;
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
/**
 * The worker's command ring: its base and capacity in bytes, which the world sets at sync points; its write cursor past
 * the base, which the worker stores at each task's end and the world resets at sync points; and the bytes its tasks
 * needed since, spills included, which the next sync point grows the ring to. The base reads as unsigned.
 */
export const ringBase = 4;
export const ringCapacity = 5;
export const ringCursor = 6;
export const ringNeeded = 7;
/** Each worker's control words take a whole line. */
export const controlWords = lineWords;
