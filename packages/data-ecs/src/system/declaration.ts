import type { Resource } from '../resource/resource.js';
import type { Schema } from '../schema/schema.js';
import type { ComponentAccess, Lookup, ResourceAccess } from './access.js';
import type { Name } from './name.js';
import type { Shader } from './render.js';
import type { System } from './system.js';
import type { OperatorOf, Reduced } from '../resource/reduction.js';

export type Declaration = {
    readonly name: Name;
    /**
     * Compiled to a kernel, which the build rejects if the body leaves the kernel subset. Values in `components` and
     * `lookup` must be linear and resources read-only. Without it, the system runs as written on the main thread.
     * - `"cpu"`: runs in chunks across workers, as WASM where the body allows, or on the main thread.
     * - `"gpu"`: also has no lookups, change filters, commands or loops, and only 4-byte scalar values. It runs as a
     *   compute shader in a world with a GPU, and as a `"cpu"` kernel in one without. Its writes mark whole columns
     *   changed.
     */
    readonly kernel?: "cpu" | "gpu";
    /** The entities it runs over, and what it reads and writes of theirs. Omitted for a system that runs once per run, on the main thread. */
    readonly components?: ComponentAccess;
    readonly lookup?: { readonly [name: string]: Lookup };
    readonly resources?: ResourceAccess;
    /** The resources its body contributes to, each with the operator its `reduce` trait declares. */
    readonly reduce?: { readonly [K in Reduced]?: OperatorOf<K> };
    /** The value passed to each run. A system with input can't use `added` or `changed`. */
    readonly input?: Schema;
    /** Makes this a render system (see `render`): its body records GPU work over the GPU copy of the components it names. */
    readonly shader?: Shader;
    /** Hard constraint. */
    readonly before?: readonly System<unknown>[];
    /** Hard constraint. */
    readonly after?: readonly System<unknown>[];
    /** Soft constraint: prefers the same tier, where nothing orders them apart. */
    readonly during?: readonly System<unknown>[];
};
