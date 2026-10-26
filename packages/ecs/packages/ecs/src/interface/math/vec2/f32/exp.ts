// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const exp = intrinsic({ wgsl: "exp", parameters: ["vec2f"], result: "vec2f" }, ([x, y]: F32): F32 => [Math.exp(x), Math.exp(y)]);
