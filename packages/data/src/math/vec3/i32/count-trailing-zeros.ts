// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec3_I32 } from "./i32.js";
import { U32 } from "../../u32/index.js";

export const countTrailingZeros = ([x, y, z]: Vec3_I32): Vec3_I32 => [
    U32.countTrailingZeros(x),
    U32.countTrailingZeros(y),
    U32.countTrailingZeros(z),
];
