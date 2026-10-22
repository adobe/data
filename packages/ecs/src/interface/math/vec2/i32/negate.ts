// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32 as Vec2_I32 } from "./i32.js";
import { intrinsic } from "../../intrinsic.js";

export const negate = intrinsic({ wgsl: "-", form: "prefix", parameters: ["vec2i"], result: "vec2i" }, ([x, y]: Vec2_I32): Vec2_I32 => [(-x) | 0, (-y) | 0]);
