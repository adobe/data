// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec4_I32 } from "./i32.js";

export const negate = ([x, y, z, w]: Vec4_I32): Vec4_I32 => [-x, -y, -z, -w];
