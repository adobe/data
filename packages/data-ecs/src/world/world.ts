import type { Component } from '../component/component.js';
import type { ReadonlyValue } from '../component/value.js';
import type { Entity } from '../entity/entity.js';
import type { Resource } from '../resource/resource.js';
import type { ReadonlyValue as ReadonlyResourceValue } from '../resource/value.js';
import type { Input } from '../system/input.js';
import type { System } from '../system/system.js';
import type { Options } from './query/options.js';

/**
 * `query` and `read` are for use outside the schedule, on the main thread.
 * They are valid only between runs and return the state as of the last sync point.
 * Members are written out here, so declarations a consumer emits for their results name no internal module.
 */
export type World = {
    /**
     * Runs a system or composite, ending in a sync point. The first time it runs here, the world registers it with
     * its members and loads their kernels. Rejects if that fails, or if a system or finalizer throws.
     */
    run<I>(system: System<I>, ...input: Input<NoInfer<I>>): Promise<void>;
    /** Waits for pending runs, then terminates workers and releases memory. The world is unusable afterwards. */
    dispose(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
    /** Values a GPU kernel wrote stay on the GPU; `query` and `read` see them only after `synchronize`. */
    readonly query: {
        /** Entities that have every component in `has` and none in `not`. */
        select<const C extends readonly Component.Name[]>(has: C, options?: Options<C>): readonly Entity[];
        /** Number of entities `select` would return, without building the array. */
        count<const C extends readonly Component.Name[]>(has: C, options?: Options<C>): number;
    };
    readonly read: {
        /** The listed components of an entity, or `null` if it's dead or lacks any of them. */
        entity<const C extends readonly Component.Name[]>(entity: Entity, components: C): { readonly [K in C[number]]: ReadonlyValue<K> } | null;
        /** One component of an entity, or `null` if it's dead or lacks it. */
        component<C extends Component.Name>(entity: Entity, component: C): ReadonlyValue<C> | null;
        resource<R extends Resource.Name>(name: R): ReadonlyResourceValue<R>;
    };
    /** Brings the CPU copies of these components up to date with GPU writes, queued with runs. */
    synchronize(components: readonly Component.Name[]): Promise<void>;
};

export * as World from './index.js';
