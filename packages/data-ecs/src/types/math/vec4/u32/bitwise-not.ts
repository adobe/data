import type { U32 as Vec4_U32 } from "./u32.js";
import { intrinsic } from "../../intrinsic.js";

export const bitwiseNot = intrinsic({ wgsl: "~", form: "prefix", parameters: ["vec4u"], result: "vec4u" }, ([x, y, z, w]: Vec4_U32): Vec4_U32 => [(~x) >>> 0, (~y) >>> 0, (~z) >>> 0, (~w) >>> 0]);
