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

/** A derived component starts at its schema's `default`, which a constant's value already is. */
type DerivedType<T> = Schema.ForType<T> & ({ readonly const: unknown } | Starting<T>);

/**
 * The value type's part of a declaration: `type`, a schema for it, when it's data. A type that isn't data has no
 * `type`, and a derived one starts at the declaration's `default`.
 */
type TypePart<K extends Key, T> =
    IsData<T> extends true
        ? { readonly type: Components[K] extends { readonly derived: true } ? DerivedType<T> : Schema.ForType<T> }
        : { readonly type?: never } & (Components[K] extends { readonly derived: true } ? Starting<T> : { readonly default?: never });

/**
 * What `register(K, ...)` takes: exactly the traits `Components[K]` declares, `type` as a schema for the declared type.
 * A trait whose declared value its definition doesn't allow on `K`, or one a value of its type must declare and
 * doesn't, becomes `never`, so registration fails to compile, as every registration does while a component, resource
 * or trait is keyed by a string (`SymbolKeys`).
 */
export type Declaration<K extends Key> =
    TypePart<K, Components[K]["type"]>
    & { readonly [T in Exclude<keyof Components[K], "type">]:
        T extends TraitKey ? (Components[K][T] extends Traits<K>[T] ? Components[K][T] : never) :
        never }
    & { readonly [T in Exclude<TraitKey, keyof Components[K]>]?: never }
    & Required<Components[K], Components[K]["type"]>
    & SymbolKeys;
