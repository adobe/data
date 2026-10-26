// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32 as Vec4_I32 } from "./i32.js";
import { U32 } from "../../u32/index.js";
import { intrinsic } from "../../intrinsic.js";

export const reverseBits = intrinsic({ wgsl: "reverseBits", parameters: ["vec4i"], result: "vec4i" }, ([x, y, z, w]: Vec4_I32): Vec4_I32 => [
    U32.reverseBits(x) | 0,
    U32.reverseBits(y) | 0,
    U32.reverseBits(z) | 0,
    U32.reverseBits(w) | 0,
]);
