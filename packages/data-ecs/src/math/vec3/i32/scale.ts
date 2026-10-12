import type { I32 as Vec3_I32 } from "./i32.js";

export const scale = ([x, y, z]: Vec3_I32, s: number): Vec3_I32 => [
    Math.imul(x, s),
    Math.imul(y, s),
    Math.imul(z, s),
];
