import type { F32 } from "./f32.js";

export const abs = ([x, y]: F32): F32 => [Math.abs(x), Math.abs(y)];
