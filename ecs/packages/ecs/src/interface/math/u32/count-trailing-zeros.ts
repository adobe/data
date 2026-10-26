// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 } from "./index.js";
import { intrinsic } from "../intrinsic.js";

export const countTrailingZeros = intrinsic({ wgsl: "countTrailingZeros", parameters: ["u32"], result: "u32" }, (n: U32): U32 => {
    const v = n >>> 0;
    return v === 0 ? 32 : 31 - Math.clz32(v & -v);
});
