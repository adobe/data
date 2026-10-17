import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const asinh = intrinsic({ wgsl: "asinh", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.asinh(x), Math.asinh(y), Math.asinh(z), Math.asinh(w)]);
