import type { Component } from '../component/component.js';
import type { ThreadOfComponent } from '../component/value.js';
import type { Resource } from '../resource/resource.js';
import type { ThreadOfResource } from '../resource/value.js';
import type { Listed, Property } from './property.js';

type Lookups<D> = Property<D, "lookup">;
type LookupReads<D> = { [L in keyof Lookups<D>]: Listed<Lookups<D>[L], "read"> }[keyof Lookups<D>];
type Components<D> = Property<D, "components">;
type Resources<D> = Property<D, "resources">;

/** The components that place a declaration: those it reads, writes or filters on by change. */
type Placing<D> =
    | Listed<Components<D>, "read"> | Listed<Components<D>, "write"> | Listed<Components<D>, "added"> | Listed<Components<D>, "changed">
    | LookupReads<D> | Listed<Property<D, "up">, "read">;

/** The resources that place a declaration: those it reads, writes, filters on by change, or reads as a condition. */
type PlacingResources<D> =
    Listed<Resources<D>, "read"> | Listed<Resources<D>, "write"> | Listed<Resources<D>, "changed"> | Listed<Resources<D>, "is">;

/** The threads of the object components and resources a declaration uses. */
export type ThreadsOf<D> = ThreadOfComponent<Placing<D> & Component.Key> | ThreadOfResource<PlacingResources<D> & Resource.Key>;

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;

/** Requires a property no declaration has when `T` holds more than one thread, so the declaration fails to compile. */
export type OneThread<T> = true extends IsUnion<T> ? { readonly "error: its object components and resources live on different threads": T } : {};
