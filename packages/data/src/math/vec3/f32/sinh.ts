// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const sinh = ([x, y, z]: F32): F32 => [Math.sinh(x), Math.sinh(y), Math.sinh(z)];
