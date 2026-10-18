import type { ThreadOf } from '../thread/of.js';
import type { Key as TraitKey } from "../trait/key.js";
import type { Key } from "./key.js";
import type { Components } from "./types.js";

/** Every component's value type, computed once so `Value` is a lookup. */
type ValueTypes = { readonly [K in Key]: Components[K] extends { readonly type: infer T } ? T : never };

/** The value type of component `K`. */
export type Value<K extends Key> = ValueTypes[K];

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/** Component `K`'s value as reads return it: read-only, with branded primitives such as `Entity` as they are. */
export type ReadonlyValue<K extends Key> = Value<K> extends Primitive ? Value<K> : Readonly<Value<K>>;

/** Components that declare trait `T`, with a value assignable to `V`. */
export type With<T extends TraitKey, V = unknown> = { [K in Key]: Components[K] extends { readonly [P in T]: V } ? K : never }[Key];


/** Components only rules add and remove. */
export type Derived = With<"derived">;

/** Components user code adds and removes: the only ones commands take. */
export type Essential = Exclude<Key, Derived>;

/** Components systems may write: every one but references, which change only through commands. */
export type Writable = Exclude<Key, With<"reference">>;

/** Every component's thread, computed once so `ThreadOf` is a lookup. */
type Threads = { readonly [K in Key]: ThreadOf<Components[K], Value<K>> };

/** The thread component `K` lives on, or `never` for a struct, which lives in shared memory. */
export type ThreadOfComponent<K extends Key> = Threads[K];
