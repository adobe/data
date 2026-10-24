// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Index } from '../indexes/index-type.js';
import type { Resource } from '../resource/resource.js';
import type { ComponentAccess, ComponentLists, ResourceAccess, ResourceLists, SystemLookup, SystemLookupLists, Up, UpLists } from './access.js';
import type { Shader } from './render.js';
import type { System } from './system.js';

/**
 * A system never declares its thread: it runs on the one its object components and resources live on, those it
 * reads, writes or filters on by change, through its row, lookups, `up` and resources. Without them, a kernel runs on
 * the kernel pool and any other system on `"world"`. A declaration says only what its body can't show: which entities
 * it runs over, its filters and conditions, and its order; the build infers what the body reads, writes and reduces.
 */
export type Declaration = {
    /**
     * Whether its body compiles to a kernel, a function the build compiles to run on every matched row, in parallel, on
     * the kernel pool. Values in `components` and `lookup` must be structs and resources read-only.
     * - Without it, a system with components compiles when its body is in the kernel subset and its declaration allows
     *   it, and otherwise runs as written, computing as the body as written does. A system without components runs once,
     *   as written.
     * - `true`: compiles, or the build fails saying why. Its arithmetic may round each step to storage precision, as
     *   WASM's f32 SIMD lanes do, so its results may differ from the body as written.
     * - `false`: runs as written, on its thread.
     * - `"gpu"`: also has no lookups, change filters, commands or loops, and only 4-byte scalar values, its `up`
     *   included. It runs as a compute shader in a world with a GPU, and as a kernel on the pool in one without. Every
     *   matched row counts as changed in what it writes.
     */
    readonly kernel?: boolean | "gpu";
    /** The entities it runs over. Omitted for a system that runs once per run. */
    readonly components?: ComponentAccess;
    readonly lookup?: { readonly [name: string]: SystemLookup };
    /**
     * Runs rows in depth order through `through`, so each reads its parent's values after the parent ran, as the
     * context's `up`, or null for a row without a parent. With change filters, a row also passes when its parent, or
     * what it reads of its parent, changed since the system last ran, or it moved to another archetype, as removing its
     * parent moves it. Rows on or under a parent cycle don't run.
     */
    readonly up?: Up;
    /**
     * Runs the rows it matches that this sorted index holds, in key order and then entity order; with change filters,
     * the rows that pass, in that order. Commands, reductions and side effects follow it. Like a lookup through the
     * index, it reads the index's key parts and doesn't write them. Not with `up`.
     */
    readonly order?: Index<{ readonly sorted: true }>;
    readonly resources?: ResourceAccess;
    /**
     * The field of its body's input naming the one entity it runs on: its body runs once, on that entity's row, when
     * the entity is alive and matches `components`, and not at all otherwise. Needs `components`; not with `kernel`,
     * `up` or `order`, nor with a body that reduces.
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

/** A declaration as the world takes it: the build's inferred reads, writes and reductions joined with what it declares. */
export type Resolved = Omit<Declaration, "components" | "lookup" | "up" | "resources"> & {
    readonly components?: ComponentLists;
    readonly lookup?: { readonly [name: string]: SystemLookupLists };
    readonly up?: UpLists;
    readonly resources?: ResourceLists;
};
