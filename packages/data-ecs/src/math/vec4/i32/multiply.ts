import type { I32 as Vec4_I32 } from "./i32.js";

export const multiply = ([x1, y1, z1, w1]: Vec4_I32, [x2, y2, z2, w2]: Vec4_I32): Vec4_I32 => [
    Math.imul(x1, x2),
    Math.imul(y1, y2),
    Math.imul(z1, z2),
    Math.imul(w1, w2),
];
