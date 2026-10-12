import type { F32 } from "./f32.js";
import { length } from "./length.js";
import { subtract } from "./subtract.js";
import { intrinsic } from "../../intrinsic.js";

export const distance = intrinsic({ wgsl: "distance", parameters: ["vec2f", "vec2f"], result: "f32" }, (a: F32, b: F32): number => length(subtract(b, a)));
