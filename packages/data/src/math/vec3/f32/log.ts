// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const log = ([x, y, z]: F32): F32 => [Math.log(x), Math.log(y), Math.log(z)];
