import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const asinh = intrinsic({ wgsl: "asinh", parameters: ["vec2f"], result: "vec2f" }, ([x, y]: F32): F32 => [Math.asinh(x), Math.asinh(y)]);
