import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const floor = intrinsic({ wgsl: "floor", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.floor(x), Math.floor(y), Math.floor(z)]);
