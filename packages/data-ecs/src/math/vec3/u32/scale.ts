import type { U32 as Vec3_U32 } from "./u32.js";
import { intrinsic } from "../../intrinsic.js";

export const scale = intrinsic({ wgsl: "*", form: "infix", parameters: ["vec3u", "u32"], result: "vec3u" }, ([x, y, z]: Vec3_U32, s: number): Vec3_U32 => [
    Math.imul(x, s) >>> 0,
    Math.imul(y, s) >>> 0,
    Math.imul(z, s) >>> 0,
]);
