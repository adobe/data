// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec4_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";

export const reverseBits = ([x, y, z, w]: Vec4_U32): Vec4_U32 => [
    U32.reverseBits(x),
    U32.reverseBits(y),
    U32.reverseBits(z),
    U32.reverseBits(w),
];
