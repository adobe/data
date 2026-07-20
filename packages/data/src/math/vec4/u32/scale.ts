// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec4_U32 } from "./u32.js";

export const scale = ([x, y, z, w]: Vec4_U32, s: number): Vec4_U32 => [
    (x * s) >>> 0,
    (y * s) >>> 0,
    (z * s) >>> 0,
    (w * s) >>> 0,
];
