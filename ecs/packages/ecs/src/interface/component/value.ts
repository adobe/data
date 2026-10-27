// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ThreadOf } from '../thread/of.js';
import type { Key as TraitKey } from "../trait/key.js";
import type { Key } from "./key.js";
import type { Components } from "./types.js";

/** Every component's value type, computed once so `Type` is a lookup. */
type Types = { readonly [K in Key]: Components[K] extends { readonly type: infer T } ? T : never };

/** The value type of component `K`. */
export type Type<K extends Key> = Types[K];

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/** Component `K`'s value as reads return it: read-only, with branded primitives such as `Entity` as they are. */
export type ReadonlyType<K extends Key> = Type<K> extends Primitive ? Type<K> : Readonly<Type<K>>;

/** Components that declare trait `T`, with a value assignable to `V`. */
export type With<T extends TraitKey, V = unknown> = { [K in Key]: Components[K] extends { readonly [P in T]: V } ? K : never }[Key];


/** Components only rules add and remove. */
export type Derived = With<"derived">;

/** Components user code adds and removes: the only ones commands take. */
export type Essential = Exclude<Key, Derived>;

/** Components whose value is their archetype's, once for every entity it holds: those declared `shared`. */
export type Shared = With<"shared">;

/**
 * Components systems may write: every one but references, which change only through commands, and shared ones, which
 * only `commands.add` gives another value.
 */
export type Writable = Exclude<Key, With<"reference"> | Shared>;

/** Every component's thread, computed once so `ThreadOf` is a lookup. */
type Threads = { readonly [K in Key]: ThreadOf<Components[K], Type<K>> };

/** The thread component `K` lives on, or `never` for a struct, which lives in shared memory. */
export type ThreadOfComponent<K extends Key> = Threads[K];
