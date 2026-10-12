import type { U32 as Vec4_U32 } from "./u32.js";

export const scale = ([x, y, z, w]: Vec4_U32, s: number): Vec4_U32 => [
    Math.imul(x, s) >>> 0,
    Math.imul(y, s) >>> 0,
    Math.imul(z, s) >>> 0,
    Math.imul(w, s) >>> 0,
];
