// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 as Vec2_U32 } from "./u32.js";
import { max } from "./max.js";
import { min } from "./min.js";
import { intrinsic } from "../../intrinsic.js";

export const clamp = intrinsic({ wgsl: "clamp", parameters: ["vec2u", "vec2u", "vec2u"], result: "vec2u" }, (v: Vec2_U32, minVec: Vec2_U32, maxVec: Vec2_U32): Vec2_U32 => min(max(v, minVec), maxVec));
