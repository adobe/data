import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const sqrt = intrinsic({ wgsl: "sqrt", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.sqrt(x), Math.sqrt(y), Math.sqrt(z), Math.sqrt(w)]);
