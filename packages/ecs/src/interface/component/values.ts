import type { Key } from "./key.js";
import type { Value } from './value.js';

/** Values for any subset of components, keyed by component. */
export type Values = { readonly [K in Key]?: Value<K> };
