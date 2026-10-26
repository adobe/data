// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Reduction } from '../resource/reduction.js';

/** Every reduction operator. */
export const reductionOperators: readonly Reduction[] = ["+", "*", "min", "max", "&", "|", "^"];

/** Whether a value is a reduction operator. */
export const isReduction = (value: unknown): value is Reduction => reductionOperators.some(operator => operator === value);
