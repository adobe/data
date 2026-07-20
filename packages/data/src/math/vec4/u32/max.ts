// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec4_U32 } from "./u32.js";

export const max = ([x1, y1, z1, w1]: Vec4_U32, [x2, y2, z2, w2]: Vec4_U32): Vec4_U32 => [
    Math.max(x1, x2) >>> 0,
    Math.max(y1, y2) >>> 0,
    Math.max(z1, z2) >>> 0,
    Math.max(w1, w2) >>> 0,
];
