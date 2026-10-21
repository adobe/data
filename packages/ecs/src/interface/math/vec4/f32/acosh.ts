import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const acosh = intrinsic({ wgsl: "acosh", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.acosh(x), Math.acosh(y), Math.acosh(z), Math.acosh(w)]);
