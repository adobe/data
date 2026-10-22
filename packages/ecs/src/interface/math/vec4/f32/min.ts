import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const min = intrinsic({ wgsl: "min", parameters: ["vec4f", "vec4f"], result: "vec4f" }, ([x1, y1, z1, w1]: F32, [x2, y2, z2, w2]: F32): F32 => [
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.min(z1, z2),
    Math.min(w1, w2)
]);
