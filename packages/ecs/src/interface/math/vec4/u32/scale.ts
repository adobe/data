// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 as Vec4_U32 } from "./u32.js";
import { intrinsic } from "../../intrinsic.js";
import type { U32 } from "../../u32/index.js";

export const scale = intrinsic({ wgsl: "*", form: "infix", parameters: ["vec4u", "u32"], result: "vec4u" }, ([x, y, z, w]: Vec4_U32, s: U32): Vec4_U32 => [
    Math.imul(x, s) >>> 0,
    Math.imul(y, s) >>> 0,
    Math.imul(z, s) >>> 0,
    Math.imul(w, s) >>> 0,
]);
