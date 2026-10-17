import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const log2 = intrinsic({ wgsl: "log2", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.log2(x), Math.log2(y), Math.log2(z)]);
