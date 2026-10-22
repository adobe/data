import type { ThreadOf } from '../thread/of.js';
import type { Key } from "./key.js";
import type { Resources } from "./types.js";

/** Every resource's value type, computed once so `Value` is a lookup. */
type ValueTypes = { readonly [K in Key]: Resources[K] extends { readonly type: infer T } ? T : never };

/** The value type of resource `K`. */
export type Value<K extends Key> = ValueTypes[K];

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/** Resource `K`'s value as reads return it: read-only, with branded primitives such as `Entity` as they are. */
export type ReadonlyValue<K extends Key> = Value<K> extends Primitive ? Value<K> : Readonly<Value<K>>;

/** Every resource's thread, computed once so `ThreadOf` is a lookup. */
type Threads = { readonly [K in Key]: ThreadOf<Resources[K], Value<K>> };

/** The thread resource `K` lives on, or `never` for a struct, which lives in shared memory. */
export type ThreadOfResource<K extends Key> = Threads[K];
