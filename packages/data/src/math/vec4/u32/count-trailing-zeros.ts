// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec4_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";

export const countTrailingZeros = ([x, y, z, w]: Vec4_U32): Vec4_U32 => [
    U32.countTrailingZeros(x),
    U32.countTrailingZeros(y),
    U32.countTrailingZeros(z),
    U32.countTrailingZeros(w),
];
