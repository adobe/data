import type { I32 as Vec2_I32 } from "./i32.js";
import { U32 } from "../../u32/index.js";

export const countTrailingZeros = ([x, y]: Vec2_I32): Vec2_I32 => [
    U32.countTrailingZeros(x),
    U32.countTrailingZeros(y),
];
