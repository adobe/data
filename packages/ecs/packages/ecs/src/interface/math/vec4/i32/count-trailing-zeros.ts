// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32 as Vec4_I32 } from "./i32.js";
import { U32 } from "../../u32/index.js";
import { intrinsic } from "../../intrinsic.js";

export const countTrailingZeros = intrinsic({ wgsl: "countTrailingZeros", parameters: ["vec4i"], result: "vec4i" }, ([x, y, z, w]: Vec4_I32): Vec4_I32 => [
    U32.countTrailingZeros(x),
    U32.countTrailingZeros(y),
    U32.countTrailingZeros(z),
    U32.countTrailingZeros(w),
]);
