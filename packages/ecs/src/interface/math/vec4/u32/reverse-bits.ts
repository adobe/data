// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 as Vec4_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";
import { intrinsic } from "../../intrinsic.js";

export const reverseBits = intrinsic({ wgsl: "reverseBits", parameters: ["vec4u"], result: "vec4u" }, ([x, y, z, w]: Vec4_U32): Vec4_U32 => [
    U32.reverseBits(x),
    U32.reverseBits(y),
    U32.reverseBits(z),
    U32.reverseBits(w),
]);
