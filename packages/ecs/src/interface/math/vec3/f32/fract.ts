import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const fract = intrinsic({ wgsl: "fract", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [
    x - Math.floor(x),
    y - Math.floor(y),
    z - Math.floor(z)
]);
