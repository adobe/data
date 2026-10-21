import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Resource } from '../resource/resource.js';
import type { Commands } from '../system/commands.js';
import type { Listed, Property } from '../system/property.js';
import type { LookupFunction, ResourceValues, Values } from '../system/values.js';
import type { ChangesDeclaration, Declaration } from './declaration.js';
import type { Essential, ReadonlyValue } from '../component/value.js';
import type { Elsewhere, ThreadsOf } from '../system/threads.js';

/** The entity that stopped matching, with its `read` values as they are before the sync point applies. */
export type Row<D extends Declaration> =
    { readonly entity: Entity } & { readonly [K in Listed<Property<D, "components">, "read"> & Component.Key]: Component.Value<K> };

type Resources<D> = Listed<Property<D, "resources">, "read"> | Listed<Property<D, "resources">, "write">;

/**
 * Resources and lookups, each present only when declared, and the commands it issues for the next sync point: none on
 * another thread than the world's, which runs after the sync point.
 */
export type Context<D extends Declaration | ChangesDeclaration> =
    ([Resources<D>] extends [never] ? {} : {
        readonly resources: Values<Listed<Property<D, "resources">, "read">, Listed<Property<D, "resources">, "write">, Resource.Key, ResourceValues>;
    })
    & ([keyof Property<D, "lookup">] extends [never] ? {} : {
        readonly lookup: { readonly [K in keyof Property<D, "lookup">]: LookupFunction<Property<D, "lookup">[K]> };
    })
    & (true extends Elsewhere<ThreadsOf<D>> ? {} : { readonly commands: Commands });

/** The components a changes finalizer sees. */
export type Watched<D extends ChangesDeclaration> = Property<D, "watch"> extends readonly Essential[] ? Listed<D, "watch"> & Essential : Essential;

/** Entities whose components changed the same way: `from` and `to` are null for those spawned and despawned. */
export type Group<C extends Component.Key> = {
    readonly from: readonly C[] | null;
    readonly to: readonly C[] | null;
    readonly added: readonly C[];
    readonly removed: readonly C[];
    /** Removed and added again within the sync point. */
    readonly replaced: readonly C[];
    readonly entities: readonly Entity[];
};

/** A sync point's structural changes to the watched components, before they apply. */
export type ChangeSet<C extends Component.Key> = {
    readonly groups: readonly Group<C>[];
    /** The value before the sync point, or null if the entity didn't have it. */
    previous<K extends C>(entity: Entity, component: K): ReadonlyValue<K> | null;
    /** The value after it, or null if the entity won't have it. */
    next<K extends C>(entity: Entity, component: K): ReadonlyValue<K> | null;
};
