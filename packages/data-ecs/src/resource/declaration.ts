import type { Schema } from "../schema/schema.js";
import type { Name as TraitName } from "../trait/name.js";
import type { Traits } from "../trait/types.js";
import type { Name } from "./name.js";
import type { Resources } from "./types.js";

/** As for components; a resource always has a value, so its `type` schema also requires a `default`. */
export type Declaration<K extends Name> =
    { readonly [T in keyof Resources[K]]:
        T extends "type" ? Schema.ForType<Resources[K][T]> & { readonly default: Resources[K][T] } :
        T extends TraitName ? (Resources[K][T] extends Traits<K>[T] ? Resources[K][T] : never) :
        never }
    & { readonly [T in Exclude<TraitName, keyof Resources[K]>]?: never };
