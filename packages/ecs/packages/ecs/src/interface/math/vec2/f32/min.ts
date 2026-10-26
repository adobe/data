// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const min = intrinsic({ wgsl: "min", parameters: ["vec2f", "vec2f"], result: "vec2f" }, ([x1, y1]: F32, [x2, y2]: F32): F32 => [Math.min(x1, x2), Math.min(y1, y2)]);
