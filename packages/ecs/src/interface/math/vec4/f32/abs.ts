import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const abs = intrinsic({ wgsl: "abs", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.abs(x), Math.abs(y), Math.abs(z), Math.abs(w)]);
