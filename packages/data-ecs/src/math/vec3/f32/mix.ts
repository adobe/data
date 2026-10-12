import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const mix = intrinsic({ wgsl: "mix", parameters: ["vec3f", "vec3f", "f32"], result: "vec3f" }, ([x1, y1, z1]: F32, [x2, y2, z2]: F32, t: number): F32 => [
    x1 * (1 - t) + x2 * t,
    y1 * (1 - t) + y2 * t,
    z1 * (1 - t) + z2 * t
]);
