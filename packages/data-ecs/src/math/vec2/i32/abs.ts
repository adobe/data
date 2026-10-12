import type { I32 as Vec2_I32 } from "./i32.js";

export const abs = ([x, y]: Vec2_I32): Vec2_I32 => [Math.abs(x) | 0, Math.abs(y) | 0];
