// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 as Vec2_U32 } from "./u32.js";
import { intrinsic } from "../../intrinsic.js";

export const bitwiseNot = intrinsic({ wgsl: "~", form: "prefix", parameters: ["vec2u"], result: "vec2u" }, ([x, y]: Vec2_U32): Vec2_U32 => [(~x) >>> 0, (~y) >>> 0]);
