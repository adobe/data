import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const cos = intrinsic({ wgsl: "cos", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.cos(x), Math.cos(y), Math.cos(z)]);
