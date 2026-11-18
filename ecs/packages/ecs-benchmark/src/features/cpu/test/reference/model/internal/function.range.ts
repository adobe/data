// © 2026 Adobe. MIT License. See /LICENSE for details.
import { next } from "../function.next.js";
import type { Generator } from "./type.generator.js";

/** A value of `rng` in `low`..`high`, as the suite draws one. */
export const range = (rng: Generator, low: number, high: number): number => (next(rng) % (high - low + 1)) + low;
