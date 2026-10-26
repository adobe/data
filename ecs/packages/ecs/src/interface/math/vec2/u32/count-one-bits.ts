// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 as Vec2_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";
import { intrinsic } from "../../intrinsic.js";

export const countOneBits = intrinsic({ wgsl: "countOneBits", parameters: ["vec2u"], result: "vec2u" }, ([x, y]: Vec2_U32): Vec2_U32 => [
    U32.countOneBits(x),
    U32.countOneBits(y),
]);
