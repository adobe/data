// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec2_I32 } from "./i32.js";

export const scale = ([x, y]: Vec2_I32, s: number): Vec2_I32 => [x * s, y * s];
