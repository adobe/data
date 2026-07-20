// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec4_I32 } from "./i32.js";
import { I32 } from "../../i32/index.js";

export const shiftRight = ([x, y, z, w]: Vec4_I32, s: number): Vec4_I32 => [
    I32.shiftRight(x, s),
    I32.shiftRight(y, s),
    I32.shiftRight(z, s),
    I32.shiftRight(w, s),
];
