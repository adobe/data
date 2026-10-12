import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const cross = intrinsic({ wgsl: "cross", parameters: ["vec3f", "vec3f"], result: "vec3f" }, ([x1, y1, z1]: F32, [x2, y2, z2]: F32): F32 => [
    y1 * z2 - z1 * y2,
    z1 * x2 - x1 * z2,
    x1 * y2 - y1 * x2
]);
