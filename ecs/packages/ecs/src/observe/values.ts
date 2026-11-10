// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component, Resource } from '../interface/index.js';

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/** Component `K`'s value as observers give it: read-only, with branded primitives such as `Entity` as they are. */
export type ReadonlyType<K extends Component.Key> = Component<K> extends Primitive ? Component<K> : Readonly<Component<K>>;

/** Resource `K`'s value as observers give it: a typed array's is the world's view of it, read-only. */
export type ReadonlyResourceType<K extends Resource.Key> = Resource.ReadonlyType<K>;
