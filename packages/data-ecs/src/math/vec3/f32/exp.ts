import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const exp = intrinsic({ wgsl: "exp", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.exp(x), Math.exp(y), Math.exp(z)]);
