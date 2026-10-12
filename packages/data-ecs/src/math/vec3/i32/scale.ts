import type { I32 as Vec3_I32 } from "./i32.js";
import { intrinsic } from "../../intrinsic.js";

export const scale = intrinsic({ wgsl: "*", form: "infix", parameters: ["vec3i", "i32"], result: "vec3i" }, ([x, y, z]: Vec3_I32, s: number): Vec3_I32 => [
    Math.imul(x, s),
    Math.imul(y, s),
    Math.imul(z, s),
]);
