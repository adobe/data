// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const equals = (a: F32, b: F32): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
