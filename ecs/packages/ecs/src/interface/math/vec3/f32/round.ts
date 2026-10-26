// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { roundHalfEven } from "../../f32/round-half-even.js";
import { intrinsic } from "../../intrinsic.js";

export const round = intrinsic({ wgsl: "round", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [
    roundHalfEven(x),
    roundHalfEven(y),
    roundHalfEven(z),
]);
