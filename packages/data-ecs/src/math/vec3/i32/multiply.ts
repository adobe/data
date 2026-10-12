import type { I32 as Vec3_I32 } from "./i32.js";

export const multiply = ([x1, y1, z1]: Vec3_I32, [x2, y2, z2]: Vec3_I32): Vec3_I32 => [
    Math.imul(x1, x2),
    Math.imul(y1, y2),
    Math.imul(z1, z2),
];
