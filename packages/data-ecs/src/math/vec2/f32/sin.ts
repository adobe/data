import type { F32 } from "./f32.js";

export const sin = ([x, y]: F32): F32 => [Math.sin(x), Math.sin(y)];
