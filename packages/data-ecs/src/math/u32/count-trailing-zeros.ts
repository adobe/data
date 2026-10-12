import type { U32 } from "./index.js";

export const countTrailingZeros = (n: U32): U32 => {
    const v = n >>> 0;
    return v === 0 ? 32 : 31 - Math.clz32(v & -v);
};
