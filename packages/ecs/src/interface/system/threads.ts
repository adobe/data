// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { ThreadOfComponent } from '../component/value.js';
import type { Resource } from '../resource/resource.js';
import type { ThreadOfResource } from '../resource/value.js';
import type { Index } from '../indexes/index-type.js';
import type { Listed, Property } from './property.js';
import type { KeyOf } from './values.js';

type Lookups<D> = Property<D, "lookup">;
type LookupReads<D> = { [L in keyof Lookups<D>]: Listed<Lookups<D>[L], "read"> }[keyof Lookups<D>];
type LookupKeys<D> = { [L in keyof Lookups<D>]: Lookups<D>[L] extends { readonly index: Index<infer I> } ? KeyOf<I>[number] : never }[keyof Lookups<D>];
type OrderKeys<D> = Property<D, "order"> extends Index<infer I> ? KeyOf<I>[number] : never;
type Components<D> = Property<D, "components">;
type Resources<D> = Property<D, "resources">;

/** The components that place a declaration: those it reads, writes or filters on by change, and the keys it looks up and orders by. */
type Placing<D> =
    | Listed<Components<D>, "read"> | Listed<Components<D>, "write"> | Listed<Components<D>, "added"> | Listed<Components<D>, "changed">
    | LookupReads<D> | LookupKeys<D> | Listed<Property<D, "up">, "read"> | OrderKeys<D>;

/** The resources that place a declaration: those it reads, writes, filters on by change, or reads as a condition. */
type PlacingResources<D> =
    Listed<Resources<D>, "read"> | Listed<Resources<D>, "write"> | Listed<Resources<D>, "changed"> | Listed<Resources<D>, "is">;

/** The threads of the object components and resources a declaration uses. */
export type ThreadsOf<D> = ThreadOfComponent<Placing<D> & Component.Key> | ThreadOfResource<PlacingResources<D> & Resource.Key>;

/** Each object component and resource a declaration uses, by key, with the thread it lives on. */
export type ThreadedBy<D> = {
    readonly [K in (Placing<D> & Component.Key) | (PlacingResources<D> & Resource.Key) as [Thread<K>] extends [never] ? never : K]: Thread<K>;
};
type Thread<K> = K extends Component.Key ? ThreadOfComponent<K> : K extends Resource.Key ? ThreadOfResource<K> : never;

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;

/**
 * Requires a property no declaration has when `T` holds more than one thread, so the declaration fails to compile; its
 * value names each key with its thread, `ThreadedBy` of the declaration.
 */
export type OneThread<T, Keys = T> = true extends IsUnion<T> ? { readonly "error: its object components and resources live on different threads": { readonly [K in keyof Keys]: Keys[K] } } : {};

/**
 * Whether `T`, the thread a declaration's objects live on, is another than the world's, which a joined thread may fill;
 * false for the threads of every declaration, which hold the world's.
 */
export type Elsewhere<T> = [T] extends [never] ? false : "world" extends T ? false : true;
