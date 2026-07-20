// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const exp2 = ([x, y, z]: F32): F32 => [Math.pow(2, x), Math.pow(2, y), Math.pow(2, z)];
