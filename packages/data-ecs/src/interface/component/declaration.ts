import type { IsData } from "../schema/is-data.js";
import type { Entry } from "../trait/entry.js";
import type { Key as TraitKey } from "../trait/key.js";
import type { AnyObjectType } from "../trait/object.js";
import type { Required } from "../trait/required.js";
import type { Traits } from "../trait/types.js";
import type { SymbolKeys } from "../trait/symbol-keys.js";
import type { Key } from "./key.js";

/** A value starts at `default`, which a type that allows `null` may leave out: it's `null` then. */
export type Starting<T> = null extends T ? { readonly default?: T } : { readonly default: T };

/**
 * What a `type` must also be: a schema's `default` is a value of its type, and a derived component starts at it, at
 * its `const` or at `null`. A type that's data has a schema, not `object<T>()`.
 */
type TypeCheck<S, V, Derived> =
    S extends AnyObjectType ? (IsData<V> extends true ? never : unknown) :
    Derived extends true ? (S extends { readonly const: unknown } ? unknown : Starting<V>) :
    { readonly default?: V };

/** Where `default` goes: a derived object starts at it, and no other component has one beside its type. */
type DefaultCheck<D, V> = D extends { readonly type: AnyObjectType; readonly derived: true } ? Starting<V> : { readonly default?: never };

/**
 * What `register(K, D)` takes: `D` itself, each trait's value one its definition allows on `K` given `D`'s entry
 * `E`, else `never`, so registration fails to compile; with the traits a value of its type must declare, and while a
 * component, resource or trait is keyed by a string, a property naming them (`SymbolKeys`).
 */
export type Declaration<K extends Key, D, E extends { readonly type: unknown } = Entry<D> & { readonly type: unknown }> =
    D
    & { readonly [T in keyof D]:
        T extends "type" ? TypeCheck<D[T], E["type"], D extends { readonly derived: true } ? true : false> :
        T extends "default" ? unknown :
        T extends TraitKey ? (D[T] extends Traits<K, E>[T] ? unknown : never) :
        never }
    & DefaultCheck<D, E["type"]>
    & Required<E>
    & SymbolKeys;
