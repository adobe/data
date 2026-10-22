import type { I32 as Vec3_I32 } from "./i32.js";
import { U32 } from "../../u32/index.js";
import { intrinsic } from "../../intrinsic.js";

export const countLeadingZeros = intrinsic({ wgsl: "countLeadingZeros", parameters: ["vec3i"], result: "vec3i" }, ([x, y, z]: Vec3_I32): Vec3_I32 => [
    U32.countLeadingZeros(x),
    U32.countLeadingZeros(y),
    U32.countLeadingZeros(z),
]);
