// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec3_I32 } from "./i32.js";

export const equals = (a: Vec3_I32, b: Vec3_I32): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
