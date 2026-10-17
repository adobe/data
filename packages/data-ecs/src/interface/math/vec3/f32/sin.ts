import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const sin = intrinsic({ wgsl: "sin", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.sin(x), Math.sin(y), Math.sin(z)]);
