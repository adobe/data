// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Generator } from "./internal/type.generator.js";

/** `random_xoshiro128`'s next value, its state stepped in place. */
export const next = (rng: Generator): number => {
    const s = rng.state;
    const result = Math.imul(rotateLeft(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotateLeft(s[3], 11);
    return result;
};

const rotateLeft = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;
