// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const atan = ([x, y, z, w]: F32): F32 => [Math.atan(x), Math.atan(y), Math.atan(z), Math.atan(w)];
