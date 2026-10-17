import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const sin = intrinsic({ wgsl: "sin", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.sin(x), Math.sin(y), Math.sin(z), Math.sin(w)]);
