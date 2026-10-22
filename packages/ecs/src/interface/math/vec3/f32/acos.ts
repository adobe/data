// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const acos = intrinsic({ wgsl: "acos", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.acos(x), Math.acos(y), Math.acos(z)]);
