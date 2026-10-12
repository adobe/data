import type { I32 as Vec4_I32 } from "./i32.js";
import { intrinsic } from "../../intrinsic.js";

export const scale = intrinsic({ wgsl: "*", form: "infix", parameters: ["vec4i", "i32"], result: "vec4i" }, ([x, y, z, w]: Vec4_I32, s: number): Vec4_I32 => [
    Math.imul(x, s),
    Math.imul(y, s),
    Math.imul(z, s),
    Math.imul(w, s),
]);
