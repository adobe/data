// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec3_I32 } from "./i32.js";

export const shiftLeft = ([x, y, z]: Vec3_I32, s: number): Vec3_I32 => [x << s, y << s, z << s];
