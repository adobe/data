// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 } from "./index.js";
import { intrinsic } from "../intrinsic.js";

export const countLeadingZeros = intrinsic({ wgsl: "countLeadingZeros", parameters: ["u32"], result: "u32" }, (n: U32): U32 => Math.clz32(n >>> 0));
