import type { F32 } from "./f32.js";
import { length } from "./length.js";
import { scale } from "./scale.js";
import { intrinsic } from "../../intrinsic.js";

export const normalize = intrinsic({ wgsl: "normalize", parameters: ["vec4f"], result: "vec4f" }, (v: F32): F32 => scale(v, 1 / length(v)));
