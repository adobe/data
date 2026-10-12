import type { F32 } from "./f32.js";
import { roundHalfEven } from "../../f32/round-half-even.js";

export const round = ([x, y, z, w]: F32): F32 => [
    roundHalfEven(x),
    roundHalfEven(y),
    roundHalfEven(z),
    roundHalfEven(w),
];
