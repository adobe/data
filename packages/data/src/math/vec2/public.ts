// © 2026 Adobe. MIT License. See /LICENSE for details.

export * as F32 from "./f32/public.js";
export * as U32 from "./u32/public.js";
export * as I32 from "./i32/public.js";

// Backwards compatibility: Vec2 is synonymous with Vec2.F32
export { schema, layout } from "./f32/public.js";
export * from "./f32/functions.js";
