// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Commands } from '../system/commands.js';
import type { Listed, Property } from '../system/property.js';
import type { LookupFunction } from '../system/values.js';
import type { WriteResources } from '../system/body.js';
import type { ChangesDeclaration, Declaration } from './declaration.js';
import type { Essential, ReadonlyType } from '../component/value.js';
import type { Elsewhere, ThreadsOf } from '../system/threads.js';

/**
 * The entity that stopped matching, with the values of its `with` as they are before the sync point applies, and of
 * its `optional` where it had them, `undefined` where it didn't.
 */
export type Row<D extends Declaration> =
    { readonly entity: Entity } & { readonly [K in Listed<Property<D, "components">, "with"> & Component.Key]: Component<K> }
    & { readonly [K in Exclude<Listed<Property<D, "components">, "optional">, Listed<Property<D, "components">, "with">> & Component.Key]: Component<K> | undefined };

/**
 * Every resource, its lookups when declared, and the commands it issues for the next sync point: none on another
 * thread than the world's, which runs after the sync point and writes no resources.
 */
export type Context<D extends Declaration | ChangesDeclaration> =
    { readonly resources: WriteResources }
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
    /** Given a value by an add while the entity has it before and after, removed and added again meanwhile or not. */
    readonly replaced: readonly C[];
    readonly entities: readonly Entity[];
};

/** A sync point's structural changes to the watched components, and the values adds replace, before they apply. */
export type ChangeSet<C extends Component.Key> = {
    readonly groups: readonly Group<C>[];
    /** The value before the sync point, or null if the entity didn't have it. */
    previous<K extends C>(entity: Entity, component: K): ReadonlyType<K> | null;
    /** The value after it, or null if the entity won't have it. */
    next<K extends C>(entity: Entity, component: K): ReadonlyType<K> | null;
};
