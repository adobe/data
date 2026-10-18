import type { Key } from "./key.js";
import type { Value } from './value.js';

/** The values of the listed components, keyed by component. */
export type ValuesOf<C extends readonly Key[]> = { readonly [K in C[number]]: Value<K> };
