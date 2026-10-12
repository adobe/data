import type { F32 } from "./f32.js";

export const sin = ([x, y, z, w]: F32): F32 => [Math.sin(x), Math.sin(y), Math.sin(z), Math.sin(w)];
