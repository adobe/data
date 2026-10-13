import type { Schema } from "../schema/schema.js";
import type { Name as TraitName } from "../trait/name.js";
import type { Types as TraitTypes } from "../trait/types.js";
import type { Name } from "./name.js";
import type { Types } from "./types.js";

/** As for components; a resource always has a value, so its `type` schema also requires a `default`. */
export type Declaration<K extends Name> =
    { readonly [T in keyof Types[K]]:
        T extends "type" ? Schema.ForType<Types[K][T]> & { readonly default: Types[K][T] } :
        T extends TraitName ? (Types[K][T] extends TraitTypes<K>[T] ? Types[K][T] : never) :
        never }
    & { readonly [T in Exclude<TraitName, keyof Types[K]>]?: never };
