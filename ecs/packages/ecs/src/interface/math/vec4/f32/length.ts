// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const length = intrinsic({ wgsl: "length", parameters: ["vec4f"], result: "f32" }, ([x, y, z, w]: F32): number => Math.sqrt(x * x + y * y + z * z + w * w));
