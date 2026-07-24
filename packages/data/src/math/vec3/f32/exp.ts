// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const exp = ([x, y, z]: F32): F32 => [Math.exp(x), Math.exp(y), Math.exp(z)];
