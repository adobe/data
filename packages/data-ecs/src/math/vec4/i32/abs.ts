import type { I32 as Vec4_I32 } from "./i32.js";

export const abs = ([x, y, z, w]: Vec4_I32): Vec4_I32 => [
    Math.abs(x) | 0,
    Math.abs(y) | 0,
    Math.abs(z) | 0,
    Math.abs(w) | 0,
];
