// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Mat4x4 } from "./index.js";

export const transpose = (m: Mat4x4): Mat4x4 => [
    m[0], m[4], m[8], m[12],
    m[1], m[5], m[9], m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15]
];
