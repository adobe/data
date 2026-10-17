import type { F32 } from "./f32.js";
import { roundHalfEven } from "../../f32/round-half-even.js";
import { intrinsic } from "../../intrinsic.js";

export const round = intrinsic({ wgsl: "round", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: F32): F32 => [
    roundHalfEven(x),
    roundHalfEven(y),
    roundHalfEven(z),
    roundHalfEven(w),
]);
