import type { I32 as Vec4_I32 } from "./i32.js";
import { intrinsic } from "../../intrinsic.js";

export const subtract = intrinsic({ wgsl: "-", form: "infix", parameters: ["vec4i", "vec4i"], result: "vec4i" }, ([x1, y1, z1, w1]: Vec4_I32, [x2, y2, z2, w2]: Vec4_I32): Vec4_I32 => [
    (x1 - x2) | 0,
    (y1 - y2) | 0,
    (z1 - z2) | 0,
    (w1 - w2) | 0,
]);
