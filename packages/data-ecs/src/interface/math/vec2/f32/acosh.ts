import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const acosh = intrinsic({ wgsl: "acosh", parameters: ["vec2f"], result: "vec2f" }, ([x, y]: F32): F32 => [Math.acosh(x), Math.acosh(y)]);
