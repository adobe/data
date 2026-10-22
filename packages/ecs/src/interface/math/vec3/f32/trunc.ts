import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const trunc = intrinsic({ wgsl: "trunc", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.trunc(x), Math.trunc(y), Math.trunc(z)]);
