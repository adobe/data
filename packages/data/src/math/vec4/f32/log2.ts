// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const log2 = ([x, y, z, w]: F32): F32 => [Math.log2(x), Math.log2(y), Math.log2(z), Math.log2(w)];
