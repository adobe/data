import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const abs = intrinsic({ wgsl: "abs", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.abs(x), Math.abs(y), Math.abs(z)]);
