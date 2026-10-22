import type { U32 as Vec3_U32 } from "./u32.js";
import { max } from "./max.js";
import { min } from "./min.js";
import { intrinsic } from "../../intrinsic.js";

export const clamp = intrinsic({ wgsl: "clamp", parameters: ["vec3u", "vec3u", "vec3u"], result: "vec3u" }, (v: Vec3_U32, minVec: Vec3_U32, maxVec: Vec3_U32): Vec3_U32 => min(max(v, minVec), maxVec));
