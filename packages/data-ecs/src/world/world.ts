import type { System } from '../system/system.js';
import type { Query } from './query/query.js';
import type { Read } from './read.js';
import type { Systems } from './systems.js';

/**
 * `query` and `read` are for use outside the schedule, on the main thread.
 * They are valid only between runs and return the state as of the last sync point.
 */
export type World = {
    /**
     * Runs a registered system or composite, ending in a sync point. Throws if it isn't registered.
     * Rejects if a system or finalizer throws.
     */
    run<S extends System>(system: S, ...args: System.Arguments<S>): Promise<void>;
    /** Waits for pending runs, then terminates workers and releases memory. The world is unusable afterwards. */
    dispose(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
    readonly systems: Systems;
    readonly query: Query;
    readonly read: Read;
};

export * as World from './index.js';
