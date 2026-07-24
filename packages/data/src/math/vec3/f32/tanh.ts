// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const tanh = ([x, y, z]: F32): F32 => [Math.tanh(x), Math.tanh(y), Math.tanh(z)];
