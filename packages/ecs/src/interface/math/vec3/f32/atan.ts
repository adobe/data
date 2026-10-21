import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const atan = intrinsic({ wgsl: "atan", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.atan(x), Math.atan(y), Math.atan(z)]);
