import type { I32 as Vec3_I32 } from "./i32.js";
import { max } from "./max.js";
import { min } from "./min.js";
import { intrinsic } from "../../intrinsic.js";

export const clamp = intrinsic({ wgsl: "clamp", parameters: ["vec3i", "vec3i", "vec3i"], result: "vec3i" }, (v: Vec3_I32, minVec: Vec3_I32, maxVec: Vec3_I32): Vec3_I32 => min(max(v, minVec), maxVec));
