import type { ThreadOf } from '../thread/of.js';
import type { Name as TraitName } from "../trait/name.js";
import type { Name } from "./name.js";
import type { Components } from "./types.js";

/** Every component's value type, computed once so `Value` is a lookup. */
type ValueTypes = { readonly [K in Name]: Components[K] extends { readonly type: infer T } ? T : never };

/** The value type of component `K`. */
export type Value<K extends Name> = ValueTypes[K];

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/** Component `K`'s value as reads return it: read-only, with branded primitives such as `Entity` as they are. */
export type ReadonlyValue<K extends Name> = Value<K> extends Primitive ? Value<K> : Readonly<Value<K>>;

/** Components that declare trait `T`, with a value assignable to `V`. */
export type With<T extends TraitName, V = unknown> = { [K in Name]: Components[K] extends { readonly [P in T]: V } ? K : never }[Name];


/** Components only rules add and remove. */
export type Derived = With<"derived">;

/** Components user code adds and removes: the only ones commands take. */
export type Essential = Exclude<Name, Derived>;

/** Components systems may write: every one but references, which change only through commands. */
export type Writable = Exclude<Name, With<"reference">>;

/** Every component's thread, computed once so `ThreadOf` is a lookup. */
type Threads = { readonly [K in Name]: ThreadOf<Components[K], Value<K>> };

/** The thread component `K` lives on, or `never` for a struct, which lives in shared memory. */
export type ThreadOfComponent<K extends Name> = Threads[K];
