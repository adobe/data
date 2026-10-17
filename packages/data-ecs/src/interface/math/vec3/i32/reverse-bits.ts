import type { I32 as Vec3_I32 } from "./i32.js";
import { U32 } from "../../u32/index.js";
import { intrinsic } from "../../intrinsic.js";

export const reverseBits = intrinsic({ wgsl: "reverseBits", parameters: ["vec3i"], result: "vec3i" }, ([x, y, z]: Vec3_I32): Vec3_I32 => [
    U32.reverseBits(x) | 0,
    U32.reverseBits(y) | 0,
    U32.reverseBits(z) | 0,
]);
