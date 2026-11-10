// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Random } from "./type.random.js";
import type { RandomStep } from "./type.random-step.js";

/** `random_xoshiro128::next`: xoshiro128** 1.1, in unsigned 32-bit words. */
export const nextRandom = (state: Random): RandomStep => {
    const [s0, s1, s2, s3] = state;
    const scrambled = Math.imul(s1, 5);
    const value = Math.imul((scrambled << 7) | (scrambled >>> 25), 9) >>> 0;
    const t = s1 << 9;
    const t2 = s2 ^ s0;
    const t3 = s3 ^ s1;
    const t1 = s1 ^ t2;
    const t0 = s0 ^ t3;
    return { value, state: [t0 >>> 0, t1 >>> 0, (t2 ^ t) >>> 0, ((t3 << 11) | (t3 >>> 21)) >>> 0] };
};
