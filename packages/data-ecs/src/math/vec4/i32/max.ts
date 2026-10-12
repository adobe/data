import type { I32 as Vec4_I32 } from "./i32.js";
import { intrinsic } from "../../intrinsic.js";

export const max = intrinsic({ wgsl: "max", parameters: ["vec4i", "vec4i"], result: "vec4i" }, ([x1, y1, z1, w1]: Vec4_I32, [x2, y2, z2, w2]: Vec4_I32): Vec4_I32 => [
    Math.max(x1, x2),
    Math.max(y1, y2),
    Math.max(z1, z2),
    Math.max(w1, w2),
]);
