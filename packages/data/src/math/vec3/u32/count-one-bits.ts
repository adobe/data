// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec3_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";

export const countOneBits = ([x, y, z]: Vec3_U32): Vec3_U32 => [
    U32.countOneBits(x),
    U32.countOneBits(y),
    U32.countOneBits(z),
];
