// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Mat4x4 } from "./index.js";

export const scale = (m: Mat4x4, s: number): Mat4x4 => [
    m[0] * s, m[1] * s, m[2] * s, m[3] * s,
    m[4] * s, m[5] * s, m[6] * s, m[7] * s,
    m[8] * s, m[9] * s, m[10] * s, m[11] * s,
    m[12] * s, m[13] * s, m[14] * s, m[15] * s
];
