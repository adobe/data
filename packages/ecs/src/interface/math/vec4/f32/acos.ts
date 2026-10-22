import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const acos = intrinsic({ wgsl: "acos", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.acos(x), Math.acos(y), Math.acos(z), Math.acos(w)]);
