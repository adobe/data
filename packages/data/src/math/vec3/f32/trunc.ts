// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const trunc = ([x, y, z]: F32): F32 => [Math.trunc(x), Math.trunc(y), Math.trunc(z)];
