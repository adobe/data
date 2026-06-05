// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { FractionalIndex } from "./fractional-index.js";

/**
 * Stable string compare for `FractionalIndex` keys. Explicit (not the
 * default `Array.prototype.sort` lexicographic coercion) so the comparator
 * is unambiguous and the mutation-probe test has a single line to revert.
 * `localeCompare` is deliberately avoided — fractIndex keys are ASCII
 * `[0-9A-Za-z]` and must sort by code point, not locale collation.
 */
export const compare = (a: FractionalIndex, b: FractionalIndex): number => (a < b ? -1 : a > b ? 1 : 0);
