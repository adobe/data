// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec3_U32 } from "./u32.js";

export const shiftLeft = ([x, y, z]: Vec3_U32, s: number): Vec3_U32 => [
    (x << s) >>> 0,
    (y << s) >>> 0,
    (z << s) >>> 0,
];
