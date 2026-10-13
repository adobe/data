import type { Name } from "./name.js";
import type { Types } from "./types.js";

/** Every resource's value type, computed once so `Value` is a lookup. */
type ValueTypes = { readonly [K in Name]: Types[K] extends { readonly type: infer T } ? T : never };

/** The value type of resource `K`. */
export type Value<K extends Name> = ValueTypes[K];
