import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const min = intrinsic({ wgsl: "min", parameters: ["vec3f", "vec3f"], result: "vec3f" }, ([x1, y1, z1]: F32, [x2, y2, z2]: F32): F32 => [
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.min(z1, z2)
]);
