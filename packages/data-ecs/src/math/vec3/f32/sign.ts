import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const sign = intrinsic({ wgsl: "sign", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.sign(x), Math.sign(y), Math.sign(z)]);
