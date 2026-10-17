import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

/** Each lane of the first vector to the power of the second's; as WGSL's `pow`, indeterminate for a negative base, or a zero base with an exponent at most zero. */
export const pow = intrinsic({ wgsl: "pow", parameters: ["vec4f", "vec4f"], result: "vec4f" }, ([x1, y1, z1, w1]: F32, [x2, y2, z2, w2]: F32): F32 => [
    Math.pow(x1, x2),
    Math.pow(y1, y2),
    Math.pow(z1, z2),
    Math.pow(w1, w2)
]);
