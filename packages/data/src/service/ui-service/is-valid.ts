// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { Service } from "../service.js";
import { Assert } from "../../types/assert.js";

/**
 * Checks if a service is a valid UI service.
 * A UI service may only contain the following types of properties:
 * - `Observe<T>` properties (T is intentionally unconstrained — values
 *   should be `Data` by convention, but UI services routinely observe
 *   non-serializable things like DOM nodes or measurement objects).
 * - `(...args) => Observe<T>` factory functions (args unconstrained — UI
 *   action handlers often take non-`Data` inputs such as `HTMLCanvasElement`,
 *   `Event`, or framework refs).
 * - `(...args) => void` "action" functions for unidirectional control flow.
 * - Readonly objects whose properties are all valid (for organization).
 *
 * Promise- and AsyncGenerator-returning functions are rejected: UI
 * consumers never await on service calls — state arrives back through
 * Observe subscriptions.
 *
 * @example
 * ```typescript
 * interface MyUIService extends Service {
 *   value: Observe<string>;
 *   selectById: (id: string) => Observe<string | null>;
 *   drawTo: (canvas: HTMLCanvasElement) => void;
 *   clear: () => void;
 * }
 *
 * type Check = Assert<IsValid<MyUIService>>;
 * ```
 */

// Negative: a Promise return is not valid for a UIService.
interface _InvalidPromiseService extends Service {
  fetchData(): Promise<string>;
}
// @ts-expect-error — UIServices may not expose Promise-returning functions
type _CheckInvalidPromise = Assert<IsValid<_InvalidPromiseService>>;

// Negative: AsyncGenerator return is not valid for a UIService.
interface _InvalidGeneratorService extends Service {
  stream(): AsyncGenerator<string>;
}
// @ts-expect-error — UIServices may not expose AsyncGenerator-returning functions
type _CheckInvalidGenerator = Assert<IsValid<_InvalidGeneratorService>>;

// Positive: non-Data arguments and non-Data Observe values are accepted.
interface _CanvasUIService extends Service {
  hovered: Observe<HTMLElement | null>;
  drawTo: (canvas: HTMLCanvasElement) => void;
  watch: (el: HTMLElement) => Observe<DOMRect>;
}
type _CheckCanvasUIService = Assert<IsValid<_CanvasUIService>>;

// Helper: Check if a return type is valid for a UIService.
// Observe values are accepted regardless of their payload type.
type ValidReturnType<R> =
  R extends Observe<any>
  ? true
  : R extends void
  ? true
  : false;

// Helper: Check if a single property is valid.
// Allows: any Observe, any function returning a valid return type, and
// readonly objects whose properties are all valid (for organization).
type IsValidProperty<P> =
  P extends Observe<any>
  ? true
  : P extends (...args: any[]) => infer R
  ? ValidReturnType<R>
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
