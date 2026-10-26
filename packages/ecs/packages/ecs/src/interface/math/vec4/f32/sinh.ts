// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const sinh = intrinsic({ wgsl: "sinh", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.sinh(x), Math.sinh(y), Math.sinh(z), Math.sinh(w)]);
