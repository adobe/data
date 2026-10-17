import type { Component } from '../component/component.js';
import type { ReadonlyValue } from '../component/value.js';
import type { Entity } from '../entity/entity.js';
import type { Observe } from '../observe/observe.js';
import type { Resource } from '../resource/resource.js';
import type { ReadonlyValue as ReadonlyResourceValue } from '../resource/value.js';
import type { Input } from '../system/input.js';
import type { System } from '../system/system.js';
import type { Query } from './query.js';
import type { Report } from './report.js';

/**
 * A world, on the thread that created it or one that joined it. Observing is the way to read it: an observer's first
 * value may come during the subscribing call or later, then one after each run that changed it.
 * Members are written out here, so declarations a consumer emits for their results name no internal module.
 */
export type World = {
    /**
     * The one way to change state. Runs are sequential in call order; physically, any that don't conflict overlap. Each
     * runs a system or composite, ending in a sync point, and resolves to what went wrong, if anything: systems,
     * finalizers, GPU work and observers that failed, systems skipped after a failed tier, systems skipped with a
     * failure because a thread they run on is gone, and commands that did nothing. Rejects only when the run can't
     * happen or finish: registration fails, the world is disposed, its GPU device is lost, or its sync point can't apply
     * a command's value.
     */
    run<I>(system: System<I>, ...input: Input<NoInfer<I>>): Promise<Report>;
    readonly observe: {
        /** A resource's value, then a new one after each run that changed it. */
        resource<R extends Resource.Name>(name: R): Observe<ReadonlyResourceValue<R>>;
        /**
         * Every component an entity has, each possibly present, or `null` once it's dead; then a new value after each run
         * that wrote a component it has, added or removed one, or despawned it.
         */
        entity(entity: Entity): Observe<{ readonly [K in Component.Name]?: ReadonlyValue<K> } | null>;
        /**
         * An entity's required components and those optional ones it has, or `null` while it's dead or lacks a required
         * one; then a new value after each run that wrote a listed component of it, added or removed one, or despawned
         * it. Other components' changes don't notify.
         */
        entity<const R extends readonly Component.Name[] = [], const O extends readonly Component.Name[] = []>(
            entity: Entity,
            options: { readonly required?: R; readonly optional?: O },
        ): Observe<({ readonly [K in R[number]]: ReadonlyValue<K> } & { readonly [K in O[number]]?: ReadonlyValue<K> }) | null>;
        /**
         * The entities a query matches, sorted by `order` if given, and with a `page`, at most `limit` of them from
         * `offset`; then a new value after each run whose result differs, a different set of entities or, with `order`,
         * a different order. Nothing when it's the same, even if matching entities were written. Throws for a page
         * whose offset or limit isn't a non-negative integer.
         */
        select<const R extends readonly Component.Name[] = []>(query: Query<R>): Observe<readonly Entity[]>;
        /** The number of entities a query matches, the total a page is taken from; then a new one after each run that changed it. */
        count<const R extends readonly Component.Name[] = []>(query: Omit<Query<R>, "order" | "page">): Observe<number>;
    };
    /**
     * Waits for pending runs, then releases what this thread holds of the world: on the world's thread, the world itself,
     * which is unusable afterwards; on a joined thread, its connection.
     */
    dispose(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
};

export type * as World from './index.js';
