import type { Component } from '../../interface/component/component.js';
import type { ReadonlyValue } from '../../interface/component/value.js';
import type { Entity } from '../../interface/entity/entity.js';
import type { Resource } from '../../interface/resource/resource.js';
import type { ReadonlyValue as ReadonlyResourceValue } from '../../interface/resource/value.js';
import type { Query } from '../../interface/world/query.js';
import type { World } from '../../interface/world/world.js';
import { builtIn, factory } from './observe-adapters.test-helper.js';

/**
 * Tests' reads: each is an observer's first value, of the world's own observers, or with `ECS_OBSERVE=factory` in the
 * environment, of the factories of `@adobe/data-ecs/observe`, so the whole suite checks them too.
 */
const reads = Reflect.get(globalThis, "process")?.env?.ECS_OBSERVE === "factory" ? factory : builtIn;

/** One component of an entity, or `null` if it's dead or lacks it. */
export const read = async <C extends Component.Key>(world: World, entity: Entity, component: C): Promise<ReadonlyValue<C> | null> => {
    const values: { readonly [K in C]: ReadonlyValue<K> } | null = await reads.toPromise(reads.entity(world, entity, { required: [component] }));
    return values === null ? null : values[component];
};

/** The listed components of an entity, or `null` if it's dead or lacks any of them. */
export const readEntity = <const C extends readonly Component.Key[]>(world: World, entity: Entity, components: C) =>
    reads.toPromise(reads.entity(world, entity, { required: components }));

export const readResource = <R extends Resource.Key>(world: World, name: R): Promise<ReadonlyResourceValue<R>> => reads.toPromise(reads.resource(world, name));

export const select = <const R extends readonly Component.Key[] = []>(world: World, query: Query<R>): Promise<readonly Entity[]> => reads.toPromise(reads.select(world, query));

export const count = <const R extends readonly Component.Key[] = []>(world: World, query: Omit<Query<R>, "order">): Promise<number> => reads.toPromise(reads.count(world, query));

/** One component of each of these entities, `null` for one that's dead or lacks it. */
export const readEach = <C extends Component.Key>(world: World, entities: readonly Entity[], component: C): Promise<(ReadonlyValue<C> | null)[]> =>
    Promise.all(entities.map(entity => read(world, entity, component)));
