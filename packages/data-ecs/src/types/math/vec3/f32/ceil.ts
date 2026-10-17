import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const ceil = intrinsic({ wgsl: "ceil", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.ceil(x), Math.ceil(y), Math.ceil(z)]);
