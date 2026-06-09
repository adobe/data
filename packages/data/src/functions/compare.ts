// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * The canonical comparison used for **all** index and ordered-query sorting:
 * natural ascending order via `<` / `>`. For strings this is by **code point**,
 * for numbers it is numeric — never locale collation. `localeCompare` is
 * deliberately avoided: it is collation-dependent (varies by host locale) and
 * would make index / query order non-deterministic across machines. Returns
 * `-1`, `0`, or `1`.
 *
 * Use this anywhere you sort entities or keys for an index or an ordered
 * query, including custom `order.compare` callbacks on a nested key, e.g.
 * `(a, b) => compare(a.item.fractIndex, b.item.fractIndex)`.
 */
export const compare = <T extends number | bigint | string | boolean>(a: T, b: T): number =>
    a < b ? -1 : a > b ? 1 : 0;
