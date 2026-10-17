import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const tanh = intrinsic({ wgsl: "tanh", parameters: ["vec2f"], result: "vec2f" }, ([x, y]: F32): F32 => [Math.tanh(x), Math.tanh(y)]);
