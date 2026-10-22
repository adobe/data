import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const fract = intrinsic({ wgsl: "fract", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [
    x - Math.floor(x),
    y - Math.floor(y),
    z - Math.floor(z),
    w - Math.floor(w)
]);
