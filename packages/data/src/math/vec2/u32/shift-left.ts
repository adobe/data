// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec2_U32 } from "./u32.js";

export const shiftLeft = ([x, y]: Vec2_U32, s: number): Vec2_U32 => [(x << s) >>> 0, (y << s) >>> 0];
