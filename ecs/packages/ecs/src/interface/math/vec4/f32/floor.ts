// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const floor = intrinsic({ wgsl: "floor", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.floor(x), Math.floor(y), Math.floor(z), Math.floor(w)]);
