// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 } from "./index.js";

export const countTrailingZeros = (n: U32): U32 => {
    const v = n >>> 0;
    if (v === 0) return 32;
    let count = 0;
    let x = v;
    while ((x & 1) === 0) {
        count++;
        x >>>= 1;
    }
    return count;
};
