import type { Entity } from '../../entity/entity.js';
import type { Schema } from '../../schema/schema.js';

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

export type StorageLayout = { readonly id: number; readonly fields: readonly number[]; readonly added: number; readonly changed: number };

export type ArchetypeLayout = { readonly id: number; readonly capacity: number; readonly entities: number; readonly storages: readonly StorageLayout[] };

/** Where a kernel column comes from in any archetype it matches. */
export type Source = { readonly kind: "entity" } | { readonly kind: "field" | "changed"; readonly id: number; readonly leaf: number };

/** Component ids of one lookup. */
export type LookupSetup = { readonly read: readonly number[]; readonly has: readonly number[]; readonly not: readonly number[] };

export type KernelSetup = {
    readonly index: number;
    readonly url: string;
    readonly sources: readonly Source[];
    readonly booleans: readonly boolean[];
    readonly lookups: readonly LookupSetup[];
    /** Component ids, used as `keys` so command values name components by id. */
    readonly keys: readonly number[];
    readonly added: readonly number[];
    readonly changed: readonly number[];
};

/** A command from a worker. Values and components are keyed by component id. */
export type WorkerCommand =
    | { readonly kind: "spawn" | "add"; readonly entity: Entity; readonly values: { readonly [id: string]: unknown } }
    | { readonly kind: "despawn"; readonly entity: Entity }
    | { readonly kind: "remove"; readonly entity: Entity; readonly components: readonly number[] };

/** Messages are handled in order, so a layout always arrives before the tasks that depend on it. */
export type ToWorker =
    | { readonly kind: "memory"; readonly memory: WebAssembly.Memory }
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
    | { readonly kind: "done"; readonly task: number; readonly commands: readonly WorkerCommand[] }
    | { readonly kind: "failed"; readonly task: number; readonly commands: readonly WorkerCommand[]; readonly error: WorkerError };
