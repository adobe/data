// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec3_I32 } from "./i32.js";

export const min = ([x1, y1, z1]: Vec3_I32, [x2, y2, z2]: Vec3_I32): Vec3_I32 => [
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.min(z1, z2),
];
