// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ThreadOf } from '../thread/of.js';
import type { Key } from "./key.js";
import type { ReadonlyTypedArray, TypedArray } from './readonly-typed-array.js';
import type { Resources } from "./types.js";

/** Every resource's value type, computed once so `Type` is a lookup. */
type Types = { readonly [K in Key]: Resources[K] extends { readonly type: infer T } ? T : never };

/** The value type of resource `K`. */
export type Type<K extends Key> = Types[K];

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/**
 * Resource `K`'s value as reads return it: read-only, a typed array as a `ReadonlyTypedArray`, with branded primitives
 * such as `Entity` as they are.
 */
export type ReadonlyType<K extends Key> =
    Type<K> extends Primitive ? Type<K> : Type<K> extends infer A extends TypedArray ? ReadonlyTypedArray<A> : Readonly<Type<K>>;

/** Every resource's thread, computed once so `ThreadOf` is a lookup. */
type Threads = { readonly [K in Key]: ThreadOf<Resources[K], Type<K>> };

/** The thread resource `K` lives on, or `never` for a struct, which lives in shared memory. */
export type ThreadOfResource<K extends Key> = Threads[K];
