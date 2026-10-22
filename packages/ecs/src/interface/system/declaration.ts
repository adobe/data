import type { Index } from '../indexes/index-type.js';
import type { Resource } from '../resource/resource.js';
import type { Schema } from '../schema/schema.js';
import type { ComponentAccess, ResourceAccess, SystemLookup, Up } from './access.js';
import type { Name } from './name.js';
import type { Shader } from './render.js';
import type { System } from './system.js';
import type { OperatorOf, Reduced } from '../resource/reduction.js';

/**
 * A system never declares its thread: it runs on the one its object components and resources live on, those it
 * reads, writes or filters on by change, through `components`, `lookup`, `up` and `resources` but `has` and `not`.
 * Without them, a kernel runs on the kernel pool and any other system on `"world"`.
 */
export type Declaration = {
    readonly name?: Name;
    /**
     * Compiled to a kernel, which the build rejects if the body leaves the kernel subset. Values in `components` and
     * `lookup` must be structs and resources read-only. Without it, the system runs as written, on its thread.
     * - `"cpu"`: runs on the kernel pool. - `"gpu"`: also has no lookups, change filters, commands or loops, and only
     *   4-byte scalar values, its `up` included. It runs as a   compute shader in a world with a GPU, and as a `"cpu"`
     *   kernel in one without. Every matched row counts as   changed in what it writes.
     */
    readonly kernel?: "cpu" | "gpu";
    /** The entities it runs over, and what it reads and writes of theirs. Omitted for a system that runs once per run. */
    readonly components?: ComponentAccess;
    readonly lookup?: { readonly [name: string]: SystemLookup };
    /**
     * Runs rows in depth order through `through`, so each reads its parent's `read` values after the parent ran, as
     * the context's `up`, or null for a row without a parent. With change filters, a row also passes when its parent,
     * or what it reads of its parent, changed since the system last ran, or it moved to another archetype, as removing
     * its parent moves it. Rows on or under a parent cycle don't run.
     */
    readonly up?: Up;
    /**
     * Runs the rows it matches that this sorted index holds, in key order and then entity order; with change filters,
     * the rows that pass, in that order. Commands, reductions and side effects follow it. Like a lookup through the
     * index, it reads the index's key parts and doesn't write them. Not with `up`.
     */
    readonly order?: Index<{ readonly sorted: true }>;
    readonly resources?: ResourceAccess;
    /** The resources its body contributes to, each with the operator its `reduce` trait declares. */
    readonly reduce?: { readonly [K in Reduced]?: OperatorOf<K> };
    /** The object of named fields passed to each run. A system with input can't use `added` or `changed`. */
    readonly input?: Extract<Schema, { readonly type: "object" }>;
    /**
     * The input field naming the one entity it runs on: its body runs once, on that entity's row, when the entity is
     * alive and matches `components`, and not at all otherwise. Needs `components`; not with `kernel`, `up`, `order`
     * or `reduce`.
     */
    readonly target?: string;
    /** Makes this a render system (see `render`): its body records GPU work over the GPU copy of the components it names. */
    readonly shader?: Shader;
    /** Hard constraint. */
    readonly before?: readonly System<unknown>[];
    /** Hard constraint. */
    readonly after?: readonly System<unknown>[];
    /** Runs inside the span of the systems listed: after what they follow and before what follows them. */
    readonly during?: readonly System<unknown>[];
    /**
     * Runs after the last sync point of each run and tick (a tick is a run of the added composite), reading the settled
     * state; changes nothing; never ordered; doesn't keep the loop ticking.
     */
    readonly observer?: true;
};
