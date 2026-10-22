import type { U32 } from "./index.js";
import { intrinsic } from "../intrinsic.js";

export const countOneBits = intrinsic({ wgsl: "countOneBits", parameters: ["u32"], result: "u32" }, (n: U32): U32 => {
    let x = n >>> 0;
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    x = (x + (x >>> 4)) & 0x0f0f0f0f;
    return Math.imul(x, 0x01010101) >>> 24;
});
