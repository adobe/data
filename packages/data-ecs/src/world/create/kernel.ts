import type { Entity } from '../../entity/entity.js';
import type { Commands } from '../../system/commands.js';

type Key = string | symbol;

/** A path from a component's value to one scalar leaf: `[]` for a scalar, `[1]` for a tuple element, `["x"]` for a struct field. */
export type Path = readonly (number | string)[];

/** One typed array the kernel receives, in `columns` order. */
export type Column =
    /** Float64Array of the row's entity. */
    | { readonly kind: "entity" }
    /** The typed array of one scalar leaf. Registration checks the path names a scalar leaf of the schema. */
    | { readonly kind: "field"; readonly component: Key; readonly path: Path }
    /** Float64Array of the component's changed ticks, stamped with `tick` on each write. */
    | { readonly kind: "changed"; readonly component: Key };

/** A whole-value write assumed exactly these leaves. Registration checks they are all of the schema's leaves. */
export type Shape = { readonly component: Key; readonly leaves: readonly Path[] };

/**
 * Processes rows `start` to `end` (exclusive). Change filters are applied by the caller, which passes only passing ranges.
 * - `resources`: values in `KernelDescription.resources` order.
 * - `lookups`: functions in `KernelDescription.lookups` order, returning the lookup's `read` values in declared order, or `null`.
 * - `keys`: what command values use to name components: `KernelDescription.keys` on the main thread, component ids in workers.
 */
export type Kernel = (
    columns: readonly (Float64Array | Float32Array | Int32Array | Uint32Array | Uint8Array)[],
    start: number,
    end: number,
    resources: readonly unknown[],
    lookups: readonly ((entity: Entity) => readonly unknown[] | null)[],
    keys: readonly (Key | number)[],
    args: unknown,
    commands: Commands,
    tick: number,
) => void;

/** What the compiler emits for one kernel system. */
export type KernelDescription = {
    readonly columns: readonly Column[];
    readonly shapes: readonly Shape[];
    readonly resources: readonly Key[];
    readonly lookups: readonly string[];
    readonly keys: readonly Key[];
    /** A module exporting `create`, importable from the main thread and from workers. */
    readonly url: string;
};

/** What a kernel module at `KernelDescription.url` exports. */
export type KernelModule = {
    /** Called once per registration. `booleans[k]` is true when column `k` stores booleans as 0 or 1, so reads convert them. */
    readonly create: (booleans: readonly boolean[]) => Kernel;
};
