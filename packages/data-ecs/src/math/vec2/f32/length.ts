import type { F32 } from "./f32.js";

export const length = ([x, y]: F32): number => Math.sqrt(x * x + y * y);
