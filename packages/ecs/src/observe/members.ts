// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component, Components, Entity, Resource, World } from '../interface/index.js';
import { observeEntity } from './entity.js';
import type { Observe } from './observe.js';
import { observeCount, observeSelect } from './select.js';
import type { Query } from './query.js';
import { observeResource } from './resource.js';
import type { ReadonlyResourceValue, ReadonlyValue } from './values.js';

export { toPromise } from './to-promise.js';
export type { Query } from './query.js';

/**
 * A resource's value, then a new one after each run or tick that changed it: one whose sync point stamped it, even with
 * the same value, a reduced resource when its fold differs.
 */
export const resource = <R extends Resource.Key>(world: World, resource: R): Observe<ReadonlyResourceValue<R>> =>
    observeResource(world, resource);

/**
 * An entity's required components and those optional ones it has, or `null` while it's dead or lacks a required one;
 * then a new value after each run or tick that wrote a listed component of it, added or removed one, or despawned it.
 * Other components' changes don't notify, nor does anything while it stays `null`. Values map over
 * `Pick<Components, ...>`, so their symbol keys keep the declarations a consumer's emitted types name them by.
 */
export const entity = <const R extends readonly Component.Key[] = [], const O extends readonly Component.Key[] = []>(
    world: World,
    entity: Entity,
    components: { readonly required?: R; readonly optional?: O },
): Observe<({ readonly [K in keyof Pick<Components, R[number]>]: ReadonlyValue<K> } & { readonly [K in keyof Pick<Components, O[number]>]?: ReadonlyValue<K> }) | null> =>
    observeEntity(world, entity, components);

/**
 * The entities a query matches, sorted by `order` if given, and with a `page`, at most `limit` of them from `offset`;
 * then a new value after each run or tick whose result differs. Nothing when it's the same, even if matching entities
 * were written. Throws for a page whose offset or limit isn't a non-negative integer.
 */
export const select = <const R extends readonly Component.Key[] = []>(world: World, query: Query<R>): Observe<readonly Entity[]> =>
    observeSelect(world, query);

/** The number of entities a query matches; then a new one after each run or tick that changed it. */
export const count = <const R extends readonly Component.Key[] = []>(world: World, query: Omit<Query<R>, "order" | "page">): Observe<number> =>
    observeCount(world, query);
