import type { Schema } from '../schema/schema.js';
import type { Name } from './name.js';
import type { Lookup, Query, Resources } from './query.js';

export type Declaration = {
    readonly name: Name;
    /**
     * Compiled to a kernel that can run in chunks across workers. Values in `query` and `lookup` must be linear
     * and resources read-only; the build fails if the body leaves the kernel subset. Otherwise the system runs on the main thread.
     */
    readonly kernel?: boolean;
    /** Omitted for a resource-only system, which runs once per run on the main thread. */
    readonly query?: Query;
    readonly lookup?: { readonly [name: string]: Lookup };
    readonly resources?: Resources;
    /** Arguments passed to each run. A system with arguments can't use `added` or `changed`. */
    readonly args?: Schema;
    /** Hard constraint. */
    readonly before?: readonly Name[];
    /** Hard constraint. */
    readonly after?: readonly Name[];
    /** Soft constraint: prefer the same tier. */
    readonly during?: readonly Name[];
};
