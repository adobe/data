import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const sign = intrinsic({ wgsl: "sign", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.sign(x), Math.sign(y), Math.sign(z), Math.sign(w)]);
