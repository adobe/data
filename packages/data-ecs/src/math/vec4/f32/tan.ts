import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const tan = intrinsic({ wgsl: "tan", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.tan(x), Math.tan(y), Math.tan(z), Math.tan(w)]);
