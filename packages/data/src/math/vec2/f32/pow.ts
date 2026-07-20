// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const pow = ([x1, y1]: F32, [x2, y2]: F32): F32 => [
    Math.pow(x1, x2),
    Math.pow(y1, y2)
];
