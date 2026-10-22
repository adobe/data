import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const scale = intrinsic({ wgsl: "*", form: "infix", parameters: ["vec2f", "f32"], result: "vec2f" }, ([x, y]: F32, s: number): F32 => [x * s, y * s]);
