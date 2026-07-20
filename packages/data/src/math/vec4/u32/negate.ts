// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec4_U32 } from "./u32.js";

export const negate = ([x, y, z, w]: Vec4_U32): Vec4_U32 => [(-x) >>> 0, (-y) >>> 0, (-z) >>> 0, (-w) >>> 0];
