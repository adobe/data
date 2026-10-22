import type { I32 as Vec4_I32 } from "./i32.js";
import { U32 } from "../../u32/index.js";
import { intrinsic } from "../../intrinsic.js";

export const countLeadingZeros = intrinsic({ wgsl: "countLeadingZeros", parameters: ["vec4i"], result: "vec4i" }, ([x, y, z, w]: Vec4_I32): Vec4_I32 => [
    U32.countLeadingZeros(x),
    U32.countLeadingZeros(y),
    U32.countLeadingZeros(z),
    U32.countLeadingZeros(w),
]);
