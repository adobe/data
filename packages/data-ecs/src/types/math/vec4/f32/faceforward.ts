import type { F32 } from "./f32.js";
import { dot } from "./dot.js";
import { negate } from "./negate.js";
import { intrinsic } from "../../intrinsic.js";

export const faceforward = intrinsic({ wgsl: "faceForward", parameters: ["vec4f", "vec4f", "vec4f"], result: "vec4f" }, (n: F32, i: F32, nref: F32): F32 =>
    dot(nref, i) < 0 ? n : negate(n));
