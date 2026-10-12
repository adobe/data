import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const floor = intrinsic({ wgsl: "floor", parameters: ["vec2f"], result: "vec2f" }, ([x, y]: F32): F32 => [Math.floor(x), Math.floor(y)]);
