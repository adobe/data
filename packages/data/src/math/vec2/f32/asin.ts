// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const asin = ([x, y]: F32): F32 => [Math.asin(x), Math.asin(y)];
