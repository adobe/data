/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

import { Schema } from "../core/schema/schema.js";
import { Data } from "../index.js";

export type ErrorResult<Result, Error> = Partial<Result> & {
  readonly error: Error;
  readonly progress?: number;
}

export type IntermediateResult<Result> = Partial<Result> & {
  readonly error?: never;
  readonly progress: number;
}

export type SuccessResult<Result> = Result & {
  readonly error?: never;
  readonly progress: 1.0;
}

export type ProgressiveResult<Result, Error> = IntermediateResult<Result> | SuccessResult<Result> | ErrorResult<Result, Error>;

/**
 * Results must be objects as we are going to add error and progress properties to them.
 */
type ResultSchema = Schema & { properties: {}, required: string[] };

/**
 * Returns a json schema for an final result with the specified value schema.
 */
export function SuccessResultSchema<T extends ResultSchema>(valueSchema: T) {
  const { properties, required, ...rest } = valueSchema;
  return {
    ...rest,
    type: 'object',
    properties: {
      ...properties,
      progress: { const: 1.0 },
    },
    required: [...required, 'progress'],
  } as const;
}

/**
 * Returns a json schema for an intermediate result with the specified result schema.
 */
export function IntermediateResultSchema<T extends ResultSchema>(valueSchema: T) {
  const { properties, required, ...rest } = valueSchema;
  return {
    ...rest,
    type: 'object',
    properties: {
      ...properties,
      error: valueSchema,
    },
    required: ['progress'],
  } as const;
}

/**
 * Returns a json schema for an error result with the specified result schema.
 */
export function ErrorResultSchema<T extends ResultSchema, E extends ResultSchema>(valueSchema: T, errorSchema: E) {
  const { properties, required, ...rest } = valueSchema;
  return {
    ...rest,
    type: 'object',
    properties: {
      ...properties,
      error: errorSchema,
    },
    required: ['error'],
  } as const;
}

/**
 * Returns a json schema for a progressive result with the specified result schemas.
 */
export function ProgressiveResultSchema<T extends ResultSchema, E extends ResultSchema>(
  successSchema: T,
  errorSchema: E,
) {
  return {
    oneOf: [IntermediateResultSchema(successSchema), SuccessResultSchema(successSchema), ErrorResultSchema(successSchema, errorSchema)],
  } as const;
}

/**
 * Checks if the result is an error result.
 */
export function isErrorResult<FinalValue extends ResultSchema, ErrorValue>(
  result: ProgressiveResult<FinalValue, ErrorValue>
): result is ErrorResult<FinalValue, ErrorValue> {
  return result.error !== null && result.error !== undefined;
}

/**
 * Checks if the result is not started. We check progress < 0.0 to mean not started.
 */
export function isNotStarted<FinalValue extends ResultSchema, ErrorValue>(
  result: ProgressiveResult<FinalValue, ErrorValue>
): result is IntermediateResult<FinalValue> {
  return !isErrorResult(result) && result.progress < 0.0;
}

/**
 * Checks if the result is an intermediate result.
 */
export function isIntermediateResult<FinalValue extends ResultSchema, ErrorValue>(
  result: ProgressiveResult<FinalValue, ErrorValue>
): result is IntermediateResult<FinalValue> {
  return !isErrorResult(result) && result.progress !== 1.0;
}

/**
 * Checks if the result is a final result.
 */
export function isSuccessResult<FinalValue extends ResultSchema, ErrorValue>(
  result: ProgressiveResult<FinalValue, ErrorValue>
): result is SuccessResult<FinalValue> {
  return !isErrorResult(result) && result.progress === 1.0;
}
