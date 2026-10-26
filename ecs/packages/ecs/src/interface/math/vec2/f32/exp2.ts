// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const exp2 = intrinsic({ wgsl: "exp2", parameters: ["vec2f"], result: "vec2f" }, ([x, y]: F32): F32 => [Math.pow(2, x), Math.pow(2, y)]);
