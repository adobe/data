import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const sign = intrinsic({ wgsl: "sign", parameters: ["vec2f"], result: "vec2f" }, ([x, y]: F32): F32 => [Math.sign(x), Math.sign(y)]);
