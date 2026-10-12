import type { Schema } from '../schema/schema.js';
import type { Name } from './name.js';
import type { Lookup, Query, Resources } from './query.js';
import type { Render } from './render.js';

export type Declaration = {
    readonly name: Name;
    /**
     * Compiled to a kernel, which the build rejects if the body leaves the kernel subset. Values in `query` and
     * `lookup` must be linear and resources read-only. Without it, the system runs as written on the main thread.
     * - `"cpu"`: runs in chunks across workers, as WASM where the body allows, or on the main thread.
     * - `"gpu"`: also has no lookups, change filters, commands or loops, and only 4-byte scalar values. It runs as a
     *   compute shader in a world with a GPU, and as a `"cpu"` kernel in one without. Its writes mark whole columns
     *   changed.
     */
    readonly kernel?: "cpu" | "gpu";
    /** Omitted for a resource-only system, which runs once per run on the main thread. */
    readonly query?: Query;
    readonly lookup?: { readonly [name: string]: Lookup };
    readonly resources?: Resources;
    /** Arguments passed to each run. A system with arguments can't use `added` or `changed`. */
    readonly args?: Schema;
    /** Makes this a render system (see `render`): its body records GPU work over the GPU copy of its query's components. */
    readonly render?: Render;
    /** Hard constraint. */
    readonly before?: readonly Name[];
    /** Hard constraint. */
    readonly after?: readonly Name[];
    /** Soft constraint: prefer the same tier. */
    readonly during?: readonly Name[];
};
