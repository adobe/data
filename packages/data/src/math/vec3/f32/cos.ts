// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const cos = ([x, y, z]: F32): F32 => [Math.cos(x), Math.cos(y), Math.cos(z)];
