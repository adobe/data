import type { Component, Resource } from '../index.js';

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/** Component `K`'s value as observers give it: read-only, with branded primitives such as `Entity` as they are. */
export type ReadonlyValue<K extends Component.Key> = Component.Value<K> extends Primitive ? Component.Value<K> : Readonly<Component.Value<K>>;

/** Resource `K`'s value as observers give it. */
export type ReadonlyResourceValue<K extends Resource.Key> = Resource.Value<K> extends Primitive ? Resource.Value<K> : Readonly<Resource.Value<K>>;
