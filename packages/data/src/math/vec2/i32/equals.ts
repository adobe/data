// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec2_I32 } from "./i32.js";

export const equals = ([x1, y1]: Vec2_I32, [x2, y2]: Vec2_I32): boolean => x1 === x2 && y1 === y2;
