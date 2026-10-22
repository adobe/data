import type { Describing, Starting } from "../component/declaration.js";
import type { IsData } from "../schema/is-data.js";
import type { Schema } from "../schema/schema.js";
import type { Key as TraitKey } from "../trait/key.js";
import type { Required } from "../trait/required.js";
import type { Traits } from "../trait/types.js";
import type { SymbolKeys } from "../trait/symbol-keys.js";
import type { Key } from "./key.js";
import type { Resources } from "./types.js";

/**
 * A resource always has a value: its schema's `default` or the declaration's, of the declared type `T`, either left
 * out only when `T` allows `null`. A type that isn't data has no schema, so only the declaration's.
 */
type TypePart<S, T> =
    IsData<T> extends true
        ? [S] extends [never] ? { readonly type: Schema } : Describing<S, T> & (S extends { readonly default: unknown } ? { readonly default?: never } : Starting<T>)
        : { readonly type?: never } & Starting<T>;

/** As for components, with the value a resource starts at. */
export type Declaration<K extends Key, S> =
    { readonly type?: S }
    & TypePart<S, Resources[K]["type"]>
    & { readonly [T in Exclude<keyof Resources[K], "type">]:
        T extends TraitKey ? (Resources[K][T] extends Traits<K>[T] ? Resources[K][T] : never) :
        never }
    & { readonly [T in Exclude<TraitKey, keyof Resources[K]>]?: never }
    & Required<Resources[K], Resources[K]["type"]>
    & SymbolKeys;
