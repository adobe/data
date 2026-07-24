// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec4_I32 } from "./i32.js";
import { U32 } from "../../u32/index.js";

export const countOneBits = ([x, y, z, w]: Vec4_I32): Vec4_I32 => [
    U32.countOneBits(x),
    U32.countOneBits(y),
    U32.countOneBits(z),
    U32.countOneBits(w),
];
