// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const step = ([edge1, edge2]: F32, [x, y]: F32): F32 => [
    x < edge1 ? 0 : 1,
    y < edge2 ? 0 : 1
];
