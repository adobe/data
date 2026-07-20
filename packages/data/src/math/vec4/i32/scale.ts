// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec4_I32 } from "./i32.js";

export const scale = ([x, y, z, w]: Vec4_I32, s: number): Vec4_I32 => [x * s, y * s, z * s, w * s];
