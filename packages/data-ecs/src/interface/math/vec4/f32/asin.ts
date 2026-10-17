import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const asin = intrinsic({ wgsl: "asin", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [Math.asin(x), Math.asin(y), Math.asin(z), Math.asin(w)]);
