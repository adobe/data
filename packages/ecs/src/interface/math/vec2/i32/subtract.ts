// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32 as Vec2_I32 } from "./i32.js";
import { intrinsic } from "../../intrinsic.js";

export const subtract = intrinsic({ wgsl: "-", form: "infix", parameters: ["vec2i", "vec2i"], result: "vec2i" }, ([x1, y1]: Vec2_I32, [x2, y2]: Vec2_I32): Vec2_I32 => [(x1 - x2) | 0, (y1 - y2) | 0]);
