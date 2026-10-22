import type { I32 as Vec4_I32 } from "./i32.js";
import { intrinsic } from "../../intrinsic.js";

export const negate = intrinsic({ wgsl: "-", form: "prefix", parameters: ["vec4i"], result: "vec4i" }, ([x, y, z, w]: Vec4_I32): Vec4_I32 => [
    (-x) | 0,
    (-y) | 0,
    (-z) | 0,
    (-w) | 0,
]);
