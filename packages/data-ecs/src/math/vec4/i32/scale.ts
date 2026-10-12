import type { I32 as Vec4_I32 } from "./i32.js";

export const scale = ([x, y, z, w]: Vec4_I32, s: number): Vec4_I32 => [
    Math.imul(x, s),
    Math.imul(y, s),
    Math.imul(z, s),
    Math.imul(w, s),
];
