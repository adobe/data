// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec2_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";

export const countOneBits = ([x, y]: Vec2_U32): Vec2_U32 => [
    U32.countOneBits(x),
    U32.countOneBits(y),
];
