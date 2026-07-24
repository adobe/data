// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec2_U32 } from "./u32.js";

export const negate = ([x, y]: Vec2_U32): Vec2_U32 => [(-x) >>> 0, (-y) >>> 0];
