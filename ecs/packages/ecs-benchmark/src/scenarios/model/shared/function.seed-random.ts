// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Random } from "./type.random.js";

/** `random_xoshiro128::initialise`: the state a seed starts. */
export const seedRandom = (seed: number): Random => [(seed + 3) >>> 0, (seed + 5) >>> 0, (seed + 7) >>> 0, (seed + 11) >>> 0];
