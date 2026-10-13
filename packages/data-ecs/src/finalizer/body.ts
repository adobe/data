import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Resource } from '../resource/resource.js';
import type { Listed, Property } from '../system/property.js';
import type { LookupFunction, ResourceValues, Values } from '../system/values.js';
import type { ChangesDeclaration, Declaration } from './declaration.js';

/** The entity that stopped matching, with its `read` values as they are before the sync point applies. */
export type Row<D extends Declaration> =
    { readonly entity: Entity } & { readonly [K in Listed<Property<D, "query">, "read"> & Component.Name]: Component.Value<K> };

/** Lookups and resources, flattened into one object. */
export type Context<D extends Declaration | ChangesDeclaration> =
    { readonly [K in keyof Property<D, "lookup">]: LookupFunction<Property<D, "lookup">[K]> }
    & Values<Listed<Property<D, "resources">, "read">, Listed<Property<D, "resources">, "write">, Resource.Name, ResourceValues>;

/** The components a changes finalizer sees. */
export type Watched<D extends ChangesDeclaration> = Property<D, "components"> extends readonly Component.Essential[] ? Listed<D, "components"> & Component.Essential : Component.Essential;

/** Entities whose components changed the same way: `from` and `to` are null for those spawned and despawned. */
export type Group<C extends Component.Name> = {
    readonly from: readonly C[] | null;
    readonly to: readonly C[] | null;
    readonly added: readonly C[];
    readonly removed: readonly C[];
    /** Removed and added again within the sync point. */
    readonly replaced: readonly C[];
    readonly entities: readonly Entity[];
};

/** A sync point's structural changes to the watched components, before they apply. */
export type Changes<C extends Component.Name> = {
    readonly groups: readonly Group<C>[];
    /** The value before the sync point, or null if the entity didn't have it. */
    previous<K extends C>(entity: Entity, component: K): Component.ReadonlyValue<K> | null;
    /** The value after it, or null if the entity won't have it. */
    next<K extends C>(entity: Entity, component: K): Component.ReadonlyValue<K> | null;
};
