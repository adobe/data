import type { Key } from "./key.js";
import type { Resources } from './types.js';

/** How a reduction combines values, leaf by leaf: a sum, a product, the least or greatest, or a bitwise fold. */
export type Reduction = "+" | "*" | "min" | "max" | "&" | "|" | "^";

/** The resources declared with a `reduce` trait, which systems contribute to and nothing writes. */
export type Reduced = { [K in Key]: Resources[K] extends { readonly reduce: Reduction } ? K : never }[Key];

/** The operator resource `K` is reduced with. */
export type OperatorOf<K extends Reduced> = Resources[K] extends { readonly reduce: infer R } ? R : never;
