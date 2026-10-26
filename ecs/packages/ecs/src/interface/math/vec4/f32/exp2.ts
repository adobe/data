// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const exp2 = intrinsic({ wgsl: "exp2", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.pow(2, x), Math.pow(2, y), Math.pow(2, z), Math.pow(2, w)]);
