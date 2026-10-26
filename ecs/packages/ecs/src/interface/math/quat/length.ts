// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Quat } from "../index.js";
import { intrinsic } from "../intrinsic.js";

export const length = intrinsic({ wgsl: "length", parameters: ["vec4f"], result: "f32" }, ([x, y, z, w]: Quat): number => Math.sqrt(x * x + y * y + z * z + w * w));
