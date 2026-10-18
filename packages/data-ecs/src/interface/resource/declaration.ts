import type { Starting } from "../component/declaration.js";
import type { IsData } from "../schema/is-data.js";
import type { Entry } from "../trait/entry.js";
import type { Key as TraitKey } from "../trait/key.js";
import type { AnyObjectType } from "../trait/object.js";
import type { Required } from "../trait/required.js";
import type { Traits } from "../trait/types.js";
import type { SymbolKeys } from "../trait/symbol-keys.js";
import type { Key } from "./key.js";

/** A resource always has a value: its schema's `default`, or, beside `object<T>()`, the declaration's. */
type TypeCheck<S, V> = S extends AnyObjectType ? (IsData<V> extends true ? never : unknown) : Starting<V>;

/** As for components, with the value a resource starts at. */
export type Declaration<K extends Key, D, E extends { readonly type: unknown } = Entry<D> & { readonly type: unknown }> =
    D
    & { readonly [T in keyof D]:
        T extends "type" ? TypeCheck<D[T], E["type"]> :
        T extends "default" ? unknown :
        T extends TraitKey ? (D[T] extends Traits<K, E>[T] ? unknown : never) :
        never }
    & (D extends { readonly type: AnyObjectType } ? Starting<E["type"]> : { readonly default?: never })
    & Required<E>
    & SymbolKeys;
