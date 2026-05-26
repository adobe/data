// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Guid } from "./index.js";

// Encodes a Guid as an 8-char WTF-16 string by splitting each u32 into two
// u16 code units via String.fromCharCode. This is the shortest possible JS
// string that losslessly represents 128 bits.
//
// Use ONLY as a transient Map/Set key within a single JS process. Do NOT
// serialize, transmit, JSON.stringify, or store the result: some code units
// may be lone surrogates (0xD800–0xDFFF), which corrupt on serialization.
export const toUnserializableKey = ([a, b, c, d]: Guid): string =>
    String.fromCharCode(
        a >>> 16, a & 0xFFFF,
        b >>> 16, b & 0xFFFF,
        c >>> 16, c & 0xFFFF,
        d >>> 16, d & 0xFFFF,
    );
