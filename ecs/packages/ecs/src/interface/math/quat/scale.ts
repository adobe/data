// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Quat } from "../index.js";
import { intrinsic } from "../intrinsic.js";

export const scale = intrinsic({ wgsl: "*", form: "infix", parameters: ["vec4f", "f32"], result: "vec4f" }, ([x, y, z, w]: Quat, s: number): Quat => [x * s, y * s, z * s, w * s]);
