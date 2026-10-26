// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../../interface/component/component.js';
import type { ReadonlyValue } from '../../interface/component/value.js';
import type { Entity } from '../../interface/entity/entity.js';
import type { Resource } from '../../interface/resource/resource.js';
import type { ReadonlyValue as ReadonlyResourceValue } from '../../interface/resource/value.js';
import type { World } from '../../interface/world/world.js';
import { Observe } from '../../observe/index.js';

// Tests' reads: each is the first value of an observer factory of `src/observe`.

/** One component of an entity, or `null` if it's dead or lacks it. */
export const read = async <C extends Component.Key>(world: World, entity: Entity, component: C): Promise<ReadonlyValue<C> | null> => {
    const values: { readonly [K in C]: ReadonlyValue<K> } | null = await Observe.toPromise(Observe.entity(world, entity, { required: [component] }));
    return values === null ? null : values[component];
};

/** The listed components of an entity, or `null` if it's dead or lacks any of them. */
export const readEntity = <const C extends readonly Component.Key[]>(world: World, entity: Entity, components: C) =>
    Observe.toPromise(Observe.entity(world, entity, { required: components }));

export const readResource = <R extends Resource.Key>(world: World, name: R): Promise<ReadonlyResourceValue<R>> => Observe.toPromise(Observe.resource(world, name));

export const select = <const R extends readonly Component.Key[] = []>(world: World, query: Observe.Query<R>): Promise<readonly Entity[]> => Observe.toPromise(Observe.select(world, query));

export const count = <const R extends readonly Component.Key[] = []>(world: World, query: Omit<Observe.Query<R>, "order">): Promise<number> => Observe.toPromise(Observe.count(world, query));

/** One component of each of these entities, `null` for one that's dead or lacks it. */
export const readEach = <C extends Component.Key>(world: World, entities: readonly Entity[], component: C): Promise<(ReadonlyValue<C> | null)[]> =>
    Promise.all(entities.map(entity => read(world, entity, component)));
