import type { U32 as Vec3_U32 } from "./u32.js";

export const scale = ([x, y, z]: Vec3_U32, s: number): Vec3_U32 => [
    Math.imul(x, s) >>> 0,
    Math.imul(y, s) >>> 0,
    Math.imul(z, s) >>> 0,
];
