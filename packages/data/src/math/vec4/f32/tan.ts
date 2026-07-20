// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const tan = ([x, y, z, w]: F32): F32 => [Math.tan(x), Math.tan(y), Math.tan(z), Math.tan(w)];
