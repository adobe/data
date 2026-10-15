import type { IsData } from "../schema/is-data.js";
import type { Schema } from "../schema/schema.js";
import type { Name as TraitName } from "../trait/name.js";
import type { Traits } from "../trait/types.js";
import type { Name } from "./name.js";
import type { Components } from "./types.js";

/** A value starts at `default`, which a type that allows `null` may leave out: it's `null` then. */
export type Starting<T> = null extends T ? { readonly default?: T } : { readonly default: T };

/** A derived component starts at its schema's `default`, which a constant's value already is. */
type DerivedType<T> = Schema.ForType<T> & ({ readonly const: unknown } | Starting<T>);

/**
 * The value type's part of a declaration: `type`, a schema for it, when it's data. A type that isn't data has no
 * `type`, and a derived one starts at the declaration's `default`.
 */
type TypePart<K extends Name, T> =
    IsData<T> extends true
        ? { readonly type: Components[K] extends { readonly derived: true } ? DerivedType<T> : Schema.ForType<T> }
        : { readonly type?: never } & (Components[K] extends { readonly derived: true } ? Starting<T> : { readonly default?: never });

/**
 * What `register(K, ...)` takes: exactly the traits `Components[K]` declares, `type` as a schema for the declared type.
 * A trait whose declared value its definition doesn't allow on `K` becomes `never`, so registration fails to compile.
 */
export type Declaration<K extends Name> =
    TypePart<K, Components[K]["type"]>
    & { readonly [T in Exclude<keyof Components[K], "type">]:
        T extends TraitName ? (Components[K][T] extends Traits<K>[T] ? Components[K][T] : never) :
        never }
    & { readonly [T in Exclude<TraitName, keyof Components[K]>]?: never };
