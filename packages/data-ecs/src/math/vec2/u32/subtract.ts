import type { U32 as Vec2_U32 } from "./u32.js";
import { intrinsic } from "../../intrinsic.js";

export const subtract = intrinsic({ wgsl: "-", form: "infix", parameters: ["vec2u", "vec2u"], result: "vec2u" }, ([x1, y1]: Vec2_U32, [x2, y2]: Vec2_U32): Vec2_U32 => [
    (x1 - x2) >>> 0,
    (y1 - y2) >>> 0,
]);
