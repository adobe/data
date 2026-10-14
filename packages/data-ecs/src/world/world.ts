import type { Component } from '../component/component.js';
import type { Gpu } from './gpu.js';
import type { System } from '../system/system.js';
import type { Query } from './query/query.js';
import type { Read } from './read.js';

/**
 * `query` and `read` are for use outside the schedule, on the main thread.
 * They are valid only between runs and return the state as of the last sync point.
 */
export type World = {
    /**
     * Runs a system or composite, ending in a sync point. The first time it runs here, the world registers it with
     * its members and loads their kernels. Rejects if that fails, or if a system or finalizer throws.
     */
    run<S extends System>(system: S, ...input: System.Input<S>): Promise<void>;
    /** Waits for pending runs, then terminates workers and releases memory. The world is unusable afterwards. */
    dispose(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
    /** Values a GPU kernel wrote stay on the GPU; `query` and `read` see them only after `synchronize`. */
    readonly query: Query;
    readonly read: Read;
    /** Brings the CPU copies of these components up to date with GPU writes, queued with runs. */
    synchronize(components: readonly Component.Name[]): Promise<void>;
    /** The world's GPU, or null for a world created without one. */
    readonly gpu: Gpu | null;
};

export * as World from './index.js';
