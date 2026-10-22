import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const fract = intrinsic({ wgsl: "fract", parameters: ["vec2f"], result: "vec2f" }, ([x, y]: F32): F32 => [x - Math.floor(x), y - Math.floor(y)]);
