// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const cos = intrinsic({ wgsl: "cos", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.cos(x), Math.cos(y), Math.cos(z), Math.cos(w)]);
