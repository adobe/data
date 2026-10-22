// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32 as Vec2_I32 } from "./i32.js";
import { intrinsic } from "../../intrinsic.js";

export const abs = intrinsic({ wgsl: "abs", parameters: ["vec2i"], result: "vec2i" }, ([x, y]: Vec2_I32): Vec2_I32 => [Math.abs(x) | 0, Math.abs(y) | 0]);
