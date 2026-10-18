import type { Starting } from "../component/declaration.js";
import type { IsData } from "../schema/is-data.js";
import type { Schema } from "../schema/schema.js";
import type { Key as TraitKey } from "../trait/key.js";
import type { Required } from "../trait/required.js";
import type { Traits } from "../trait/types.js";
import type { SymbolKeys } from "../trait/symbol-keys.js";
import type { Key } from "./key.js";
import type { Resources } from "./types.js";

/** A resource always has a value: its schema's `default`, or the declaration's when its type isn't data. */
type TypePart<T> = IsData<T> extends true ? { readonly type: Schema.ForType<T> & Starting<T> } : { readonly type?: never } & Starting<T>;

/** As for components, with the value a resource starts at. */
export type Declaration<K extends Key> =
    TypePart<Resources[K]["type"]>
    & { readonly [T in Exclude<keyof Resources[K], "type">]:
        T extends TraitKey ? (Resources[K][T] extends Traits<K>[T] ? Resources[K][T] : never) :
        never }
    & { readonly [T in Exclude<TraitKey, keyof Resources[K]>]?: never }
    & Required<Resources[K], Resources[K]["type"]>
    & SymbolKeys;
