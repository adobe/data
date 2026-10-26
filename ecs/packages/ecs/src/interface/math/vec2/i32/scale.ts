// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32 as Vec2_I32 } from "./i32.js";
import { intrinsic } from "../../intrinsic.js";
import type { I32 } from "../../i32/index.js";

export const scale = intrinsic({ wgsl: "*", form: "infix", parameters: ["vec2i", "i32"], result: "vec2i" }, ([x, y]: Vec2_I32, s: I32): Vec2_I32 => [Math.imul(x, s), Math.imul(y, s)]);
