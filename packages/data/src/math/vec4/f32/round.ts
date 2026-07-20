// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const round = ([x, y, z, w]: F32): F32 => [Math.round(x), Math.round(y), Math.round(z), Math.round(w)];
