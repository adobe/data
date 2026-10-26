// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const atanh = intrinsic({ wgsl: "atanh", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.atanh(x), Math.atanh(y), Math.atanh(z), Math.atanh(w)]);
