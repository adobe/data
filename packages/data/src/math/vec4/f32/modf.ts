// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";
import { fract } from "./fract.js";

export const modf = ([x, y, z, w]: F32): { fract: F32; whole: F32 } => ({
    whole: [Math.trunc(x), Math.trunc(y), Math.trunc(z), Math.trunc(w)],
    fract: [x - Math.trunc(x), y - Math.trunc(y), z - Math.trunc(z), w - Math.trunc(w)]
});
