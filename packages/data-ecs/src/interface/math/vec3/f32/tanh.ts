import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const tanh = intrinsic({ wgsl: "tanh", parameters: ["vec3f"], result: "vec3f" }, ([x, y, z]: F32): F32 => [Math.tanh(x), Math.tanh(y), Math.tanh(z)]);
