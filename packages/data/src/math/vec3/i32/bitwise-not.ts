// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec3_I32 } from "./i32.js";

export const bitwiseNot = ([x, y, z]: Vec3_I32): Vec3_I32 => [~x, ~y, ~z];
