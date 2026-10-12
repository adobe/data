import type { U32 as Vec2_U32 } from "./u32.js";
import { intrinsic } from "../../intrinsic.js";

export const scale = intrinsic({ wgsl: "*", form: "infix", parameters: ["vec2u", "u32"], result: "vec2u" }, ([x, y]: Vec2_U32, s: number): Vec2_U32 => [Math.imul(x, s) >>> 0, Math.imul(y, s) >>> 0]);
