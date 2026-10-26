// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 as Vec2_U32 } from "./u32.js";
import { intrinsic } from "../../intrinsic.js";

export const min = intrinsic({ wgsl: "min", parameters: ["vec2u", "vec2u"], result: "vec2u" }, ([x1, y1]: Vec2_U32, [x2, y2]: Vec2_U32): Vec2_U32 => [
    Math.min(x1, x2) >>> 0,
    Math.min(y1, y2) >>> 0,
]);
