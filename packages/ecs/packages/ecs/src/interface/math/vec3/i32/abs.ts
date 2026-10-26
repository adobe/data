// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32 as Vec3_I32 } from "./i32.js";
import { intrinsic } from "../../intrinsic.js";

export const abs = intrinsic({ wgsl: "abs", parameters: ["vec3i"], result: "vec3i" }, ([x, y, z]: Vec3_I32): Vec3_I32 => [
    Math.abs(x) | 0,
    Math.abs(y) | 0,
    Math.abs(z) | 0,
]);
