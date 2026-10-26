// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const step = intrinsic({ wgsl: "step", parameters: ["vec2f", "vec2f"], result: "vec2f" }, ([edge1, edge2]: F32, [x, y]: F32): F32 => [
    x < edge1 ? 0 : 1,
    y < edge2 ? 0 : 1
]);
