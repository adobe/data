import type { F32 } from "./f32.js";

export const abs = ([x, y, z]: F32): F32 => [Math.abs(x), Math.abs(y), Math.abs(z)];
