// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const trunc = intrinsic({ wgsl: "trunc", parameters: ["vec2f"], result: "vec2f" }, ([x, y]: F32): F32 => [Math.trunc(x), Math.trunc(y)]);
