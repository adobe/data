// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec2_U32 } from "./u32.js";

export const add = ([x1, y1]: Vec2_U32, [x2, y2]: Vec2_U32): Vec2_U32 => [
    (x1 + x2) >>> 0,
    (y1 + y2) >>> 0,
];
