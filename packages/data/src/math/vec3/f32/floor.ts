// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const floor = ([x, y, z]: F32): F32 => [Math.floor(x), Math.floor(y), Math.floor(z)];
