// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const tanh = intrinsic({ wgsl: "tanh", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.tanh(x), Math.tanh(y), Math.tanh(z), Math.tanh(w)]);
