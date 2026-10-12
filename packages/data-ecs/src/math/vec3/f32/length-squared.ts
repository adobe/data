import type { F32 } from "./f32.js";

export const lengthSquared = ([x, y, z]: F32): number => x * x + y * y + z * z;
