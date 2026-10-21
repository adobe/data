import type { U32 as Vec4_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";
import { intrinsic } from "../../intrinsic.js";

export const countTrailingZeros = intrinsic({ wgsl: "countTrailingZeros", parameters: ["vec4u"], result: "vec4u" }, ([x, y, z, w]: Vec4_U32): Vec4_U32 => [
    U32.countTrailingZeros(x),
    U32.countTrailingZeros(y),
    U32.countTrailingZeros(z),
    U32.countTrailingZeros(w),
]);
