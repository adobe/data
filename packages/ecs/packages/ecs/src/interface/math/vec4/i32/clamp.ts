// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32 as Vec4_I32 } from "./i32.js";
import { max } from "./max.js";
import { min } from "./min.js";
import { intrinsic } from "../../intrinsic.js";

export const clamp = intrinsic({ wgsl: "clamp", parameters: ["vec4i", "vec4i", "vec4i"], result: "vec4i" }, (v: Vec4_I32, minVec: Vec4_I32, maxVec: Vec4_I32): Vec4_I32 => min(max(v, minVec), maxVec));
