import type { I32 as Vec3_I32 } from "./i32.js";
import { intrinsic } from "../../intrinsic.js";

export const subtract = intrinsic({ wgsl: "-", form: "infix", parameters: ["vec3i", "vec3i"], result: "vec3i" }, ([x1, y1, z1]: Vec3_I32, [x2, y2, z2]: Vec3_I32): Vec3_I32 => [
    (x1 - x2) | 0,
    (y1 - y2) | 0,
    (z1 - z2) | 0,
]);
