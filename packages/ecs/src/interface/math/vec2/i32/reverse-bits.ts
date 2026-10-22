import type { I32 as Vec2_I32 } from "./i32.js";
import { U32 } from "../../u32/index.js";
import { intrinsic } from "../../intrinsic.js";

export const reverseBits = intrinsic({ wgsl: "reverseBits", parameters: ["vec2i"], result: "vec2i" }, ([x, y]: Vec2_I32): Vec2_I32 => [U32.reverseBits(x) | 0, U32.reverseBits(y) | 0]);
