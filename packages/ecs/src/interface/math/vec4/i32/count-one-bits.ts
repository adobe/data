import type { I32 as Vec4_I32 } from "./i32.js";
import { U32 } from "../../u32/index.js";
import { intrinsic } from "../../intrinsic.js";

export const countOneBits = intrinsic({ wgsl: "countOneBits", parameters: ["vec4i"], result: "vec4i" }, ([x, y, z, w]: Vec4_I32): Vec4_I32 => [
    U32.countOneBits(x),
    U32.countOneBits(y),
    U32.countOneBits(z),
    U32.countOneBits(w),
]);
