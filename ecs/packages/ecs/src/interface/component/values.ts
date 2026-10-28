// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Key } from "./key.js";
import type { Type } from './value.js';

/** Values for any subset of components, keyed by component. */
export type Values = { readonly [K in Key]?: Type<K> };
