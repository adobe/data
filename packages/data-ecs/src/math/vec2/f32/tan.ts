import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const tan = intrinsic({ wgsl: "tan", parameters: ["vec2f"], result: "vec2f" }, ([x, y]: F32): F32 => [Math.tan(x), Math.tan(y)]);
