import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const asinh = intrinsic({ wgsl: "asinh", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.asinh(x), Math.asinh(y), Math.asinh(z)]);
