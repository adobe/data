import type { Reduction } from '../resource/reduction.js';

const operators: readonly Reduction[] = ["+", "*", "min", "max", "&", "|", "^"];

/** Whether a value is a reduction operator. */
export const isReduction = (value: unknown): value is Reduction => operators.some(operator => operator === value);
