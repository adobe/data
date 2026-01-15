// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../schema/index.js";

export type ErrorResult<Error> = {
  readonly error: Error;
  readonly progress?: number;
}

export type IntermediateResult<Result> = Result & {
  readonly error?: never;
  readonly progress: number;
}

export type SuccessResult<Result> = Result & {
  readonly error?: never;
  readonly progress: 1.0;
}

export type FinalResult<Result, Error> = SuccessResult<Result> | ErrorResult<Error>;
export type ProgressiveResult<Result, Error, Intermediate = Partial<Result>> = IntermediateResult<Intermediate> | FinalResult<Result, Error>;

/**
 * Results must be objects as we are going to add error and progress properties to them.
 */
export type ResultSchema = Schema & { properties: {}, required: string[] };

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
export function isErrorResult<ErrorValue>(
  result: ProgressiveResult<any, ErrorValue> | FinalResult<any, ErrorValue>
): result is ErrorResult<ErrorValue> {
  return result.error !== null && result.error !== undefined;
}

/**
 * Checks if the result is an intermediate result.
 */
export function isIntermediateResult<IntermediateValue>(
  result: ProgressiveResult<any, any, IntermediateValue>
): result is IntermediateResult<IntermediateValue> {
  return !isErrorResult(result) && result.progress !== 1.0;
}

/**
 * Checks if the result is a final result.
 */
export function isSuccessResult<FinalValue>(
  result: ProgressiveResult<FinalValue, any, any> | FinalResult<FinalValue, any>
): result is SuccessResult<FinalValue> {
  return !isErrorResult(result) && result.progress === 1.0;
}
