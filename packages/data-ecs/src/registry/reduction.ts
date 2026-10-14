import type { Reduction } from '../resource/reduction.js';

export const reductionOperators: readonly Reduction[] = ["+", "*", "min", "max", "&", "|", "^"];

export const isReduction = (value: unknown): value is Reduction => reductionOperators.some(operator => operator === value);
