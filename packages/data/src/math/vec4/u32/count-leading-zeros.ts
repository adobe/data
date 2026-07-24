// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec4_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";

export const countLeadingZeros = ([x, y, z, w]: Vec4_U32): Vec4_U32 => [
    U32.countLeadingZeros(x),
    U32.countLeadingZeros(y),
    U32.countLeadingZeros(z),
    U32.countLeadingZeros(w),
];
