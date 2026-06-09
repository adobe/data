// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Observe } from "../../observe/index.js";
import type { Service } from "../service.js";
import type { IsValid } from "./is-valid.js";

/**
 * Restricts a single property to the UIService shape:
 * - `Observe<T>` properties pass through unchanged.
 * - Functions returning `Observe<T>` pass through unchanged.
 * - Any other function has its return type rewritten to `void`, turning it
 *   into a fire-and-forget action.
 * - Nested objects are recursively restricted.
 * - Other shapes (primitives such as `serviceName`) pass through unchanged.
 *
 * The function check must precede the object check because functions are
 * also `extends object` in TypeScript.
 */
type RestrictProperty<P> =
  P extends Observe<any>
  ? P
  : P extends (...args: infer Args) => infer R
  ? R extends Observe<any>
  ? P
  : (...args: Args) => void
  : P extends object
  ? { [K in keyof P]: RestrictProperty<P[K]> }
  : P;

type Restrict<T> = {
  [K in keyof T]: RestrictProperty<T[K]>
};

/**
 * Converts a service type to its UI-facing interface.
 *
 * - If `T` is already a valid UIService, yields `T` unchanged so consumers
 *   keep the original type name in errors and hovers.
 * - Otherwise, recursively rewrites every function whose return type is not
 *   `Observe<...>` to return `void`, enforcing unidirectional control flow
 *   for UI consumers.
 *
 * Used to constrain `service` properties on UI container elements so a
 * widget can never await on or read from a transaction / action call.
 */
export type FromService<T extends Service> =
  IsValid<T> extends true ? T : Restrict<T>;
