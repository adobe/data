// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const exp = intrinsic({ wgsl: "exp", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.exp(x), Math.exp(y), Math.exp(z), Math.exp(w)]);
