// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const ceil = ([x, y, z, w]: F32): F32 => [Math.ceil(x), Math.ceil(y), Math.ceil(z), Math.ceil(w)];
