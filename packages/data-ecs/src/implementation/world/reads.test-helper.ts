import type { Component } from '../../interface/component/component.js';
import type { ReadonlyValue } from '../../interface/component/value.js';
import type { Entity } from '../../interface/entity/entity.js';
import { toPromise } from '../../interface/observe/to-promise.js';
import type { Resource } from '../../interface/resource/resource.js';
import type { ReadonlyValue as ReadonlyResourceValue } from '../../interface/resource/value.js';
import type { Query } from '../../interface/world/query.js';
import type { World } from '../../interface/world/world.js';

/** Tests' reads: each is an observer's first value. */

/** One component of an entity, or `null` if it's dead or lacks it. */
export const read = async <C extends Component.Name>(world: World, entity: Entity, component: C): Promise<ReadonlyValue<C> | null> => {
    const values: { readonly [K in C]: ReadonlyValue<K> } | null = await toPromise(world.observe.entity(entity, { required: [component] }));
    return values === null ? null : values[component];
};

/** The listed components of an entity, or `null` if it's dead or lacks any of them. */
export const readEntity = <const C extends readonly Component.Name[]>(world: World, entity: Entity, components: C) =>
    toPromise(world.observe.entity(entity, { required: components }));

export const readResource = <R extends Resource.Name>(world: World, name: R): Promise<ReadonlyResourceValue<R>> => toPromise(world.observe.resource(name));

export const select = <const R extends readonly Component.Name[] = []>(world: World, query: Query<R>): Promise<readonly Entity[]> => toPromise(world.observe.select(query));

export const count = <const R extends readonly Component.Name[] = []>(world: World, query: Omit<Query<R>, "order">): Promise<number> => toPromise(world.observe.count(query));

/** One component of each of these entities, `null` for one that's dead or lacks it. */
export const readEach = <C extends Component.Name>(world: World, entities: readonly Entity[], component: C): Promise<(ReadonlyValue<C> | null)[]> =>
    Promise.all(entities.map(entity => read(world, entity, component)));
