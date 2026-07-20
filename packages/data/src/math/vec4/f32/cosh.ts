// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const cosh = ([x, y, z, w]: F32): F32 => [Math.cosh(x), Math.cosh(y), Math.cosh(z), Math.cosh(w)];
