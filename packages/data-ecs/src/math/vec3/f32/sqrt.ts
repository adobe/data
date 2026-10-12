import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const sqrt = intrinsic({ wgsl: "sqrt", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.sqrt(x), Math.sqrt(y), Math.sqrt(z)]);
