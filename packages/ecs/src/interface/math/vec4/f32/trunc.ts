import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const trunc = intrinsic({ wgsl: "trunc", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.trunc(x), Math.trunc(y), Math.trunc(z), Math.trunc(w)]);
