import type { F32 } from "./f32.js";

export const trunc = ([x, y]: F32): F32 => [Math.trunc(x), Math.trunc(y)];
