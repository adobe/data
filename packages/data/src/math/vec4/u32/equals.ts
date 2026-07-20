// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec4_U32 } from "./u32.js";

export const equals = (a: Vec4_U32, b: Vec4_U32): boolean =>
    a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
