// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 } from "./index.js";

export const countOneBits = (n: U32): U32 => {
    let count = 0;
    let x = n >>> 0;
    while (x !== 0) {
        count += x & 1;
        x >>>= 1;
    }
    return count;
};
