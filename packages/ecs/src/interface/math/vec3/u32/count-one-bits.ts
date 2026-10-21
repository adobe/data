import type { U32 as Vec3_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";
import { intrinsic } from "../../intrinsic.js";

export const countOneBits = intrinsic({ wgsl: "countOneBits", parameters: ["vec3u"], result: "vec3u" }, ([x, y, z]: Vec3_U32): Vec3_U32 => [
    U32.countOneBits(x),
    U32.countOneBits(y),
    U32.countOneBits(z),
]);
