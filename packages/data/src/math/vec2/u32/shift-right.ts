// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec2_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";

export const shiftRight = ([x, y]: Vec2_U32, s: number): Vec2_U32 => [
    U32.shiftRight(x, s),
    U32.shiftRight(y, s),
];
