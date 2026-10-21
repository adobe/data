import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const ceil = intrinsic({ wgsl: "ceil", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.ceil(x), Math.ceil(y), Math.ceil(z), Math.ceil(w)]);
