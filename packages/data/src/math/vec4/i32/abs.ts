// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec4_I32 } from "./i32.js";

export const abs = ([x, y, z, w]: Vec4_I32): Vec4_I32 => [Math.abs(x), Math.abs(y), Math.abs(z), Math.abs(w)];
