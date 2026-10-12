import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const pow = intrinsic({ wgsl: "pow", parameters: ["vec2f", "vec2f"], result: "vec2f" }, ([x1, y1]: F32, [x2, y2]: F32): F32 => [
    Math.pow(x1, x2),
    Math.pow(y1, y2)
]);
