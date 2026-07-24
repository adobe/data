// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec3_U32 } from "./u32.js";

export const bitwiseOr = ([x1, y1, z1]: Vec3_U32, [x2, y2, z2]: Vec3_U32): Vec3_U32 => [
    (x1 | x2) >>> 0,
    (y1 | y2) >>> 0,
    (z1 | z2) >>> 0,
];
