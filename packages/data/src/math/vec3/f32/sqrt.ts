// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const sqrt = ([x, y, z]: F32): F32 => [Math.sqrt(x), Math.sqrt(y), Math.sqrt(z)];
