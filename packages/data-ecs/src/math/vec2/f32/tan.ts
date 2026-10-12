import type { F32 } from "./f32.js";

export const tan = ([x, y]: F32): F32 => [Math.tan(x), Math.tan(y)];
