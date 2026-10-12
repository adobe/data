import type { F32 } from "./f32.js";
import { roundHalfEven } from "../../f32/round-half-even.js";

export const round = ([x, y]: F32): F32 => [roundHalfEven(x), roundHalfEven(y)];
