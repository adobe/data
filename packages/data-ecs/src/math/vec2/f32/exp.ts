import type { F32 } from "./f32.js";

export const exp = ([x, y]: F32): F32 => [Math.exp(x), Math.exp(y)];
