// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Data } from "../../data.js";
import { Observe } from "../../observe/index.js";
import { Service } from "../service.js";
import { Assert } from "../../types/assert.js";

/**
 * Checks if a service is a valid async data service.
 * An async data service may only contain the following types of properties:
 * - Observe<Data>
 * - (...args: Data[]) => Observe<Data> | void | Promise<Data | void> | AsyncGenerator<Data>
 * - Readonly objects whose properties are all valid (for organization)
 *
 * @example
 * ```typescript
 * import { Assert } from "../../types/assert.js";
 *
 * interface MyService extends Service {
 *   data: Observe<string>;
 *   fetchData: () => Promise<number>;
 * }
 *
 * // This will compile successfully if MyService is a valid async data service
 * type CheckValidDataService = Assert<IsValid<MyService>>;
 * ```
 *
 * @example
 * ```typescript
 * // Nested readonly objects for organization
 * interface MyOrganizedService extends Service {
 *   readonly foo: {
 *     bar: Observe<number>;
 *   };
 * }
 * type CheckOrganized = Assert<IsValid<MyOrganizedService>>;
 * ```
 */

// Test cases demonstrating valid async data service patterns

// Example: Service with optional properties (common for API responses with raw data)
type _ExampleServiceType = {
  readonly value: string;
  readonly optional?: number;
  readonly raw?: Data; // Use Data for untyped/raw API responses (JSON-serializable)
};

interface _ExampleService extends Service {
  fetchData(options?: { forceRefresh?: boolean }): Promise<_ExampleServiceType>;
}

// Validates that the example service conforms to async-data-service pattern
type _ExampleServiceCheck = Assert<IsValid<_ExampleService>>;

// Negative: Observe<T | undefined> is rejected — services must use null, not undefined,
// to represent the absence of a value.  undefined is not data.
interface _InvalidObserveUndefinedService extends Service {
  value: Observe<string | undefined>;
}
// @ts-expect-error — use Observe<string | null> instead of Observe<string | undefined>
type _CheckInvalidObserveUndefined = Assert<IsValid<_InvalidObserveUndefinedService>>;

// Helper: Check if a return type is valid
type ValidReturnType<R> =
  R extends Observe<infer T>
  ? T extends Data ? true : false
  : R extends void
  ? true
  : R extends Promise<infer P>
  ? P extends Data | void ? true : false
  : R extends AsyncGenerator<infer G, any, any>
  ? G extends Data ? true : false
  : false;

// Helper: Check if all arguments are Data.
// Strips `undefined` before the Data check so optional parameters (`arg?: T`)
// are accepted when T extends Data — the `| undefined` comes from the TypeScript
// optional-parameter encoding, not from a caller passing actual undefined values.
type AllArgsAreData<Args extends readonly any[]> =
  Args extends readonly []
  ? true
  : Args extends readonly [infer First, ...infer Rest]
  ? Exclude<First, undefined> extends Data
  ? AllArgsAreData<Rest>
  : false
  : Args extends readonly (infer Element)[]
  ? Exclude<Element, undefined> extends Data ? true : false
  : false;

// Helper: Check if a single property is valid
// Allows: Observe<Data>, valid functions, and readonly objects whose properties are all valid (for organization)
type IsValidProperty<P> =
  P extends Observe<infer T>
  ? T extends Data ? true : false
  : P extends (...args: infer Args) => infer R
  ? AllArgsAreData<Args> extends true
  ? ValidReturnType<R>
  : false
  : P extends object
  ? keyof P extends never
  ? false
  : { [K in keyof P]: IsValidProperty<P[K]> } extends Record<keyof P, true>
  ? true
  : false
  : false;

// Main type: Check all properties (excluding base Service properties)
type AllPropertiesValid<T extends Service> =
  {
    [K in Exclude<keyof T, keyof Service>]: IsValidProperty<T[K]>
  } extends Record<Exclude<keyof T, keyof Service>, true>
  ? true
  : false;

export type IsValid<T extends Service> = AllPropertiesValid<T>;
