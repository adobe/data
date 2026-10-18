import type { Component } from '../component/component.js';
import type { Components } from '../component/types.js';
import type { ReadonlyValue } from '../component/value.js';
import type { Entity } from '../entity/entity.js';
import type { Observe } from '../observe/observe.js';
import type { Resource } from '../resource/resource.js';
import type { ReadonlyValue as ReadonlyResourceValue } from '../resource/value.js';
import type { Query } from './query.js';

/**
 * What `world.observe` holds, named so declarations a consumer emits for it name only the package root. Values map
 * over `Pick<Components, ...>`, so their symbol keys keep the declarations a consumer's emitted types name them by.
 */
export interface Observers {
    /** A resource's value, then a new one after each run or tick that changed it. */
    resource<R extends Resource.Key>(name: R): Observe<ReadonlyResourceValue<R>>;
    /**
     * Every component an entity has, each possibly present, or `null` once it's dead; then a new value after each run or tick
     * that wrote a component it has, added or removed one, or despawned it.
     */
    entity(entity: Entity): Observe<{ readonly [K in Component.Key]?: ReadonlyValue<K> } | null>;
    /**
     * An entity's required components and those optional ones it has, or `null` while it's dead or lacks a required
     * one; then a new value after each run or tick that wrote a listed component of it, added or removed one, or despawned
     * it. Other components' changes don't notify.
     */
    entity<const R extends readonly Component.Key[] = [], const O extends readonly Component.Key[] = []>(
        entity: Entity,
        options: { readonly required?: R; readonly optional?: O },
    ): Observe<({ readonly [K in keyof Pick<Components, R[number]>]: ReadonlyValue<K> } & { readonly [K in keyof Pick<Components, O[number]>]?: ReadonlyValue<K> }) | null>;
    /**
     * The entities a query matches, sorted by `order` if given, and with a `page`, at most `limit` of them from
     * `offset`; then a new value after each run or tick whose result differs, a different set of entities or, with `order`,
     * a different order. Nothing when it's the same, even if matching entities were written. Throws for a page
     * whose offset or limit isn't a non-negative integer.
     */
    select<const R extends readonly Component.Key[] = []>(query: Query<R>): Observe<readonly Entity[]>;
    /** The number of entities a query matches, the total a page is taken from; then a new one after each run or tick that changed it. */
    count<const R extends readonly Component.Key[] = []>(query: Omit<Query<R>, "order" | "page">): Observe<number>;
}
