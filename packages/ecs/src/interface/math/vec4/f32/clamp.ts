import type { F32 } from "./f32.js";
import { max } from "./max.js";
import { min } from "./min.js";
import { intrinsic } from "../../intrinsic.js";

export const clamp = intrinsic({ wgsl: "clamp", parameters: ["vec4f", "vec4f", "vec4f"], result: "vec4f" }, (v: F32, minVec: F32, maxVec: F32): F32 => min(max(v, minVec), maxVec));
