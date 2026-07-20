// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec3_U32 } from "./u32.js";

export const equals = (a: Vec3_U32, b: Vec3_U32): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
