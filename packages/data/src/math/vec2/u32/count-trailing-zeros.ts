// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec2_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";

export const countTrailingZeros = ([x, y]: Vec2_U32): Vec2_U32 => [
    U32.countTrailingZeros(x),
    U32.countTrailingZeros(y),
];
