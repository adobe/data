// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const scale = intrinsic({ wgsl: "*", form: "infix", parameters: ["vec3f", "f32"], result: "vec3f" }, ([x, y, z]: F32, s: number): F32 => [x * s, y * s, z * s]);
