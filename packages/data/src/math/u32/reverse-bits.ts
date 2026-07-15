// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 } from "./index.js";

export const reverseBits = (n: U32): U32 => {
    let x = n >>> 0;
    let result = 0;
    for (let i = 0; i < 32; i++) {
        result = (result << 1) | (x & 1);
        x >>>= 1;
    }
    return result >>> 0;
};
