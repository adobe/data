import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

/**
 * Performs a component-wise multiplication of two vectors.
 */
export const multiply = intrinsic({ wgsl: "*", form: "infix", parameters: ["vec3f", "vec3f"], result: "vec3f" }, ([x1, y1, z1]: F32, [x2, y2, z2]: F32): F32 => [
    x1 * x2,
    y1 * y2,
    z1 * z2
]);
