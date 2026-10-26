// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32 as Vec2_I32 } from "./i32.js";
import { max } from "./max.js";
import { min } from "./min.js";
import { intrinsic } from "../../intrinsic.js";

export const clamp = intrinsic({ wgsl: "clamp", parameters: ["vec2i", "vec2i", "vec2i"], result: "vec2i" }, (v: Vec2_I32, minVec: Vec2_I32, maxVec: Vec2_I32): Vec2_I32 => min(max(v, minVec), maxVec));
