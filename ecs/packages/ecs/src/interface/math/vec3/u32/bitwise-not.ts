// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 as Vec3_U32 } from "./u32.js";
import { intrinsic } from "../../intrinsic.js";

export const bitwiseNot = intrinsic({ wgsl: "~", form: "prefix", parameters: ["vec3u"], result: "vec3u" }, ([x, y, z]: Vec3_U32): Vec3_U32 => [(~x) >>> 0, (~y) >>> 0, (~z) >>> 0]);
