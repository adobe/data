import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Resource } from '../resource/resource.js';

export type Read = {
    /** The listed components of an entity, or `null` if it's dead or lacks any of them. */
    entity<const C extends readonly Component.Name[]>(entity: Entity, components: C): Component.ValuesOf<C> | null;
    /** One component of an entity, or `null` if it's dead or lacks it. */
    component<C extends Component.Name>(entity: Entity, component: C): Readonly<Component.Types[C]> | null;
    resource<R extends Resource.Name>(name: R): Readonly<Resource.Types[R]>;
};
