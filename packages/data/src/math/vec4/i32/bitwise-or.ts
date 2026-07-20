// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec4_I32 } from "./i32.js";

export const bitwiseOr = ([x1, y1, z1, w1]: Vec4_I32, [x2, y2, z2, w2]: Vec4_I32): Vec4_I32 => [
    x1 | x2,
    y1 | y2,
    z1 | z2,
    w1 | w2,
];
