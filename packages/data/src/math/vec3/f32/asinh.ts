// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const asinh = ([x, y, z]: F32): F32 => [Math.asinh(x), Math.asinh(y), Math.asinh(z)];
