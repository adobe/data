import type { Schema } from "../schema/schema.js";
import type { Name as TraitName } from "../trait/name.js";
import type { Traits } from "../trait/types.js";
import type { Name } from "./name.js";
import type { Components } from "./types.js";

/** A derived component starts at its schema's `default`, which a constant's value already is. */
type DerivedType<T> = Schema.ForType<T> & ({ readonly const: unknown } | { readonly default: T });

/**
 * What `register(K, ...)` takes: exactly the traits `Components[K]` declares, `type` as a schema for the declared type.
 * A trait whose declared value its definition doesn't allow on `K` becomes `never`, so registration fails to compile.
 */
export type Declaration<K extends Name> =
    { readonly [T in keyof Components[K]]:
        T extends "type" ? (Components[K] extends { readonly derived: true } ? DerivedType<Components[K][T]> : Schema.ForType<Components[K][T]>) :
        T extends TraitName ? (Components[K][T] extends Traits<K>[T] ? Components[K][T] : never) :
        never }
    & { readonly [T in Exclude<TraitName, keyof Components[K]>]?: never };
