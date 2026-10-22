import type { Quat } from "../index.js";
import { intrinsic } from "../intrinsic.js";

export const dot = intrinsic({ wgsl: "dot", parameters: ["vec4f", "vec4f"], result: "f32" }, ([x1, y1, z1, w1]: Quat, [x2, y2, z2, w2]: Quat): number =>
    x1 * x2 + y1 * y2 + z1 * z2 + w1 * w2);
