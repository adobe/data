import type { U32 as Vec2_U32 } from "./u32.js";

export const scale = ([x, y]: Vec2_U32, s: number): Vec2_U32 => [Math.imul(x, s) >>> 0, Math.imul(y, s) >>> 0];
