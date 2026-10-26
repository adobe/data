// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const log = intrinsic({ wgsl: "log", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.log(x), Math.log(y), Math.log(z)]);
