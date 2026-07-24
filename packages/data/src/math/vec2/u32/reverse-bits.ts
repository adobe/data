// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec2_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";

export const reverseBits = ([x, y]: Vec2_U32): Vec2_U32 => [
    U32.reverseBits(x),
    U32.reverseBits(y),
];
