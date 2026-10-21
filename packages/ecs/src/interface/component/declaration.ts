import type { IsData } from "../schema/is-data.js";
import type { Schema } from "../schema/schema.js";
import type { Key as TraitKey } from "../trait/key.js";
import type { Required } from "../trait/required.js";
import type { Traits } from "../trait/types.js";
import type { SymbolKeys } from "../trait/symbol-keys.js";
import type { Key } from "./key.js";
import type { Components } from "./types.js";

/** A value starts at `default`, which a type that allows `null` may leave out: it's `null` then. */
export type Starting<T> = null extends T ? { readonly default?: T } : { readonly default: T };

type Same<A, B> = (<X>() => X extends A ? 1 : 2) extends (<X>() => X extends B ? 1 : 2) ? true : false;

/**
 * Nothing when schema `S` describes exactly the declared type `T` and its `default`, if any, is a `T`; else a required
 * property naming the problem, so registration fails to compile and says why. A check rather than `type`'s own type,
 * so `type` is inferred from the schema alone.
 */
export type Describing<S, T> =
    ((S extends Schema ? Same<Schema.ToType<S>, T> : false) extends true ? {} : { readonly "the schema describes another type than the declared one": T })
    & (S extends { readonly default: infer V } ? ([V] extends [T] ? {} : { readonly "the schema's default isn't of the declared type": T }) : {});

/** A derived component starts at its schema's `default`, at its `const`, or at `null` when its type allows it. */
type DerivedStart<S, T> =
    S extends { readonly const: unknown } | { readonly default: unknown } ? {} :
    null extends T ? {} :
    { readonly "a derived component's schema has a default, which it starts at": T };

/**
 * The value type's part of a declaration: `type`, schema `S`, describing exactly the declared type `T` when it's data.
 * A type that isn't data has no `type`, and a derived one starts at the declaration's `default`.
 */
type TypePart<S, T, Derived> =
    IsData<T> extends true
        ? [S] extends [never] ? { readonly type: Schema } : Describing<S, T> & { readonly default?: never } & (Derived extends true ? DerivedStart<S, T> : {})
        : { readonly type?: never } & (Derived extends true ? Starting<T> : { readonly default?: never });

/**
 * What `register(K, ...)` takes: exactly the traits `Components[K]` declares, `type` as schema `S` for the declared
 * type. A trait whose declared value its definition doesn't allow on `K`, or one a value of its type must declare and
 * doesn't, becomes `never`, so registration fails to compile, as every registration does while a component, resource
 * or trait is keyed by a string (`SymbolKeys`).
 */
export type Declaration<K extends Key, S> =
    { readonly type?: S }
    & TypePart<S, Components[K]["type"], Components[K] extends { readonly derived: true } ? true : false>
    & { readonly [T in Exclude<keyof Components[K], "type">]:
        T extends TraitKey ? (Components[K][T] extends Traits<K>[T] ? Components[K][T] : never) :
        never }
    & { readonly [T in Exclude<TraitKey, keyof Components[K]>]?: never }
    & Required<Components[K], Components[K]["type"]>
    & SymbolKeys;
