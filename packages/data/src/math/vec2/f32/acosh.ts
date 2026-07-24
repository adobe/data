// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const acosh = ([x, y]: F32): F32 => [Math.acosh(x), Math.acosh(y)];
