import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const log2 = intrinsic({ wgsl: "log2", parameters: ["vec2f"], result: "vec2f" }, ([x, y]: F32): F32 => [Math.log2(x), Math.log2(y)]);
