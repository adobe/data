import type { U32 } from "./index.js";
import { intrinsic } from "../intrinsic.js";

export const reverseBits = intrinsic({ wgsl: "reverseBits", parameters: ["u32"], result: "u32" }, (n: U32): U32 => {
    let x = n >>> 0;
    x = ((x >>> 1) & 0x55555555) | ((x & 0x55555555) << 1);
    x = ((x >>> 2) & 0x33333333) | ((x & 0x33333333) << 2);
    x = ((x >>> 4) & 0x0f0f0f0f) | ((x & 0x0f0f0f0f) << 4);
    x = ((x >>> 8) & 0x00ff00ff) | ((x & 0x00ff00ff) << 8);
    return ((x >>> 16) | (x << 16)) >>> 0;
});
