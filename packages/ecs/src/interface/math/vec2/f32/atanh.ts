import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const atanh = intrinsic({ wgsl: "atanh", parameters: ["vec2f"], result: "vec2f" }, ([x, y]: F32): F32 => [Math.atanh(x), Math.atanh(y)]);
