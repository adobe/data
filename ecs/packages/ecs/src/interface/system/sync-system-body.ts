// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Commands } from './commands.js';
import type { Listed, Property } from './property.js';
import type { LookupFunction } from './values.js';
import type { WriteResources } from './body.js';
import type { ChangesDeclaration, Declaration, OwnTrait } from './sync-system-declaration.js';
import type { Essential, ReadonlyType } from '../component/value.js';
import type { Resource } from '../resource/resource.js';
import type { Resources } from '../resource/types.js';
import type { Components } from '../component/types.js';
import type { ReadonlyType as ResourceType } from '../resource/value.js';
import type { Elsewhere, ThreadsOf } from './threads.js';

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

/** The components declaring any of the traits `T`. */
type ComponentsDeclaring<T> = { [K in Component.Key]: [Extract<keyof Components[K], T>] extends [never] ? never : K }[Component.Key];

/** The resources declaring any of the traits `T`. */
type ResourcesDeclaring<T> = { [K in Resource.Key]: [Extract<keyof Resources[K], T>] extends [never] ? never : K }[Resource.Key];

/** The components keys `L` name: each, and each declaring a trait among them. */
type ComponentsOf<L> = Extract<L, Essential> | Extract<ComponentsDeclaring<Extract<L, OwnTrait>>, Essential>;

/** The resources keys `L` name: each, and each declaring a trait among them. */
type ResourcesOf<L> = Extract<L, Resource.Key> | ResourcesDeclaring<Extract<L, OwnTrait>>;

/** The keys a changes system's `watch` lists, by kind: those of its list, or of its object's lists. */
export type WatchListed<D extends ChangesDeclaration, Of extends "components" | "resources"> = Property<D, "watch"> extends readonly (infer E)[] ? E
    : Property<D, "watch"> extends { readonly [P in Of]: readonly (infer E)[] } ? E : never;

/** The components a changes system sees. */
export type Watched<D extends ChangesDeclaration> = Property<D, "watch"> extends readonly unknown[] | { readonly components: readonly unknown[] }
    ? ComponentsOf<WatchListed<D, "components">> : Essential;

/** The resources a changes system sees: those it watches. */
export type WatchedResources<D extends ChangesDeclaration> = ResourcesOf<WatchListed<D, "resources">>;

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

/**
 * A sync point's structural changes to the watched components, and the values adds replace, before they apply; and each
 * watched resource written since the system's last sync point, to a value that isn't equal to its last one,
 * leaf by leaf for data and by identity for objects, with its value before and after; and the watched components
 * written through rows since the system's last sync point.
 */
export type ChangeSet<C extends Component.Key, R extends Resource.Key = never> = {
    readonly groups: readonly Group<C>[];
    /**
     * The watched components some system wrote through a row (`row[component] = value`), as written or as a kernel,
     * since the last sync point changes systems ran at, in no order: which components only, not which entities or values.
     */
    readonly written: readonly C[];
    readonly resources: readonly { readonly [K in R]: { readonly key: K; readonly previous: ResourceType<K>; readonly next: ResourceType<K> } }[R][];
    /** The value before the sync point, or null if the entity didn't have it. */
    previous<K extends C>(entity: Entity, component: K): ReadonlyType<K> | null;
    /** The value after it, or null if the entity won't have it. */
    next<K extends C>(entity: Entity, component: K): ReadonlyType<K> | null;
};
