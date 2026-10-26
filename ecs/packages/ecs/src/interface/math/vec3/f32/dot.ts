// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const dot = intrinsic({ wgsl: "dot", parameters: ["vec3f", "vec3f"], result: "f32" }, ([x1, y1, z1]: F32, [x2, y2, z2]: F32): number =>
    x1 * x2 + y1 * y2 + z1 * z2);
