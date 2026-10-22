import type { U32 as Vec4_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";
import { intrinsic } from "../../intrinsic.js";

export const countLeadingZeros = intrinsic({ wgsl: "countLeadingZeros", parameters: ["vec4u"], result: "vec4u" }, ([x, y, z, w]: Vec4_U32): Vec4_U32 => [
    U32.countLeadingZeros(x),
    U32.countLeadingZeros(y),
    U32.countLeadingZeros(z),
    U32.countLeadingZeros(w),
]);
