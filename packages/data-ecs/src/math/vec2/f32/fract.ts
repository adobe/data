import type { F32 } from "./f32.js";

export const fract = ([x, y]: F32): F32 => [x - Math.floor(x), y - Math.floor(y)];
