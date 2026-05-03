// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Integer index clamped to [0, len]. NaN → 0; ±Infinity → 0 / len respectively.
 */
function clampFillIndex(n: number, len: number): number {
    if (n !== n) {
        return 0;
    }
    if (!Number.isFinite(n)) {
        return n > 0 ? len : 0;
    }
    const t = Math.trunc(n);
    return Math.max(0, Math.min(t, len));
}

/**
 * Half-open range [start, end) for TypedBuffer.fill (struct path and shared semantics).
 *
 * - `start` defaults to `0`; `end` defaults to `length`.
 * - Indices are truncated to integers and clamped to `[0, length]`.
 * - There is **no** negative-from-end indexing (unlike TypedArray.fill).
 * - If after clamping `start >= end`, or `length <= 0`, returns **`null`** (empty range).
 */
export function normalizeFillRange(length: number, start?: number, end?: number): [number, number] | null {
    if (length <= 0) {
        return null;
    }
    const k = start === undefined ? 0 : clampFillIndex(Number(start), length);
    const fin = end === undefined ? length : clampFillIndex(Number(end), length);
    if (k >= fin) {
        return null;
    }
    return [k, fin];
}
