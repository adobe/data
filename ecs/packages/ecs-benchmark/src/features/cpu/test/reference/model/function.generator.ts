// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Generator } from "./internal/type.generator.js";

/** A generator seeded as `random_xoshiro128` seeds one. */
export const generator = (seed: number): Generator => ({ state: [(seed + 3) >>> 0, (seed + 5) >>> 0, (seed + 7) >>> 0, (seed + 11) >>> 0] });
