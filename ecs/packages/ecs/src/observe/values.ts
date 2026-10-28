// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component, Resource } from '../interface/index.js';

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/** Component `K`'s value as observers give it: read-only, with branded primitives such as `Entity` as they are. */
export type ReadonlyType<K extends Component.Key> = Component<K> extends Primitive ? Component<K> : Readonly<Component<K>>;

/** Resource `K`'s value as observers give it. */
export type ReadonlyResourceType<K extends Resource.Key> = Resource<K> extends Primitive ? Resource<K> : Readonly<Resource<K>>;
