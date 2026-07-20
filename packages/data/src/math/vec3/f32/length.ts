// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const length = ([x, y, z]: F32): number => Math.sqrt(x * x + y * y + z * z);
