// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const max = intrinsic({ wgsl: "max", parameters: ["vec3f", "vec3f"], result: "vec3f" }, ([x1, y1, z1]: F32, [x2, y2, z2]: F32): F32 => [
    Math.max(x1, x2),
    Math.max(y1, y2),
    Math.max(z1, z2)
]);
