// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec3_U32 } from "./u32.js";

export const negate = ([x, y, z]: Vec3_U32): Vec3_U32 => [(-x) >>> 0, (-y) >>> 0, (-z) >>> 0];
