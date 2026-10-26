// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 as Vec4_U32 } from "./u32.js";
import { max } from "./max.js";
import { min } from "./min.js";
import { intrinsic } from "../../intrinsic.js";

export const clamp = intrinsic({ wgsl: "clamp", parameters: ["vec4u", "vec4u", "vec4u"], result: "vec4u" }, (v: Vec4_U32, minVec: Vec4_U32, maxVec: Vec4_U32): Vec4_U32 => min(max(v, minVec), maxVec));
