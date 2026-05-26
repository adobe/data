// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Guid } from "./index.js";

const hex = (n: number, len: number): string => (n >>> 0).toString(16).padStart(len, "0");

// Maps [a, b, c, d] → "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
// a=bits 0-31, b=bits 32-63 (upper→seg2, lower→seg3),
// c=bits 64-95 (upper→seg4, lower→seg5 prefix), d=bits 96-127
export const toUUID = ([a, b, c, d]: Guid): string => {
    const s1 = hex(a, 8);
    const s2 = hex(b >>> 16, 4);
    const s3 = hex(b & 0xFFFF, 4);
    const s4 = hex(c >>> 16, 4);
    const s5 = hex(c & 0xFFFF, 4) + hex(d, 8);
    return `${s1}-${s2}-${s3}-${s4}-${s5}`;
};
