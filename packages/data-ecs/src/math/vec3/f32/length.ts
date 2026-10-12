import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const length = intrinsic({ wgsl: "length", parameters: ["vec3f"], result: "f32" }, ([x, y, z]: F32): number => Math.sqrt(x * x + y * y + z * z));
