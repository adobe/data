import type { I32 as Vec3_I32 } from "./i32.js";

export const negate = ([x, y, z]: Vec3_I32): Vec3_I32 => [
    (-x) | 0,
    (-y) | 0,
    (-z) | 0,
];
