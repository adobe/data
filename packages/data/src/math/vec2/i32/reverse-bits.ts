// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec2_I32 } from "./i32.js";
import { U32 } from "../../u32/index.js";

export const reverseBits = ([x, y]: Vec2_I32): Vec2_I32 => [
    U32.reverseBits(x),
    U32.reverseBits(y),
];
